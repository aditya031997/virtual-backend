import {
  Controller,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  Logger,
  HttpCode,
  Get,
  Query,
  Header,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiBody,
  ApiQuery,
  ApiTags,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { WebhookService } from '@/webhooks/webhookService';
import { CallTransferService } from '@/webhooks/callTransferService';
import { UserTransferQueryService } from '@/webhooks/userTransferQueryService';
import {
  AfterHoursPendingHumanCallService,
  type AfterHoursHumanCallOutcome,
} from '@/webhooks/afterHoursPendingHumanCallService';
import {
  ElevenLabsWebhookDto,
  TransferRequestDto,
  CreateUserTransferQueryDto,
  UpdateUserTransferQueryDto,
  UpdateUserTransferQueryStatusDto,
  AfterHoursPendingHumanCallDto,
  ShareCallerDetailsDto,
  CreateWebhookReturnRequestDto,
  CreateWebhookAppointmentDto,
  CreateWebhookDepartmentCallbackDto,
} from '@/webhooks/dto';
import { IWebhookDealerWithAgents } from '@/types/webhook';
import { EmailService } from '@/helper/email-service';
import { ShareCallerDetailsService } from '@/webhooks/shareCallerDetailsService';
import { ReturnRequestService } from '@/webhooks/returnRequestService';
import { AppointmentService } from '@/webhooks/appointmentService';
import { DepartmentCallbackService } from '@/webhooks/departmentCallbackService';
import { ConfigService } from '@nestjs/config';

/**
 * One turn of an ElevenLabs post-call transcript.
 *
 * Only the fields the outbound-result handler reads are declared, and each is
 * optional: the payload is third-party and its shape is not guaranteed.
 */
interface TranscriptTurn {
  role?: unknown;
  message?: unknown;
  tool_calls?: { tool_name?: unknown; name?: unknown }[];
}

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly emailService: EmailService,
    private readonly callTransferService: CallTransferService,
    private readonly userTransferQueryService: UserTransferQueryService,
    private readonly afterHoursPendingHumanCallService: AfterHoursPendingHumanCallService,
    private readonly shareCallerDetailsService: ShareCallerDetailsService,
    private readonly returnRequestService: ReturnRequestService,
    private readonly appointmentService: AppointmentService,
    private readonly departmentCallbackService: DepartmentCallbackService,
    private readonly configService: ConfigService,
  ) {}

  @Post('initiation')
  @HttpCode(200)
  @ApiOperation({
    summary: 'ElevenLabs initiation variables webhook',
    description:
      'Returns availability values wrapped in dynamic_variables for ElevenLabs initiation client data.',
  })
  async getInitiationDynamicVariables(): Promise<{
    dynamic_variables: {
      current_time: string;
      current_mode: 'businessHours' | 'afterHours';
      is_holiday: boolean;
      start_time: string | null;
      end_time: string | null;
    };
  }> {
    const availabilityUrl =
      this.configService.get<string>('INITIATION_AVAILABILITY_URL') ||
      'http://localhost:5000/api/availability/current-day';
    const availabilityResponse = await fetch(availabilityUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!availabilityResponse.ok) {
      throw new BadRequestException(
        `Failed to fetch staging availability (${availabilityResponse.status})`,
      );
    }

    const availability = await availabilityResponse.json();
    const { currentTime, currentMode, holiday, businessHours } = availability;

    const dynamicVariables = {
      current_time: currentTime,
      current_mode: currentMode,
      is_holiday: holiday,
      start_time: businessHours?.startTime ?? null,
      end_time: businessHours?.endTime ?? null,
    };

    return {
      dynamic_variables: dynamicVariables,
    };
  }

  @Post('conversation')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Receive ElevenLabs post-call webhook',
    description:
      'This endpoint receives the post_call_transcription webhook from ElevenLabs after a call ends',
  })
  @ApiBody({ type: ElevenLabsWebhookDto })
  async handleElevenLabsWebhook(
    @Body() webhookPayload: ElevenLabsWebhookDto,
  ): Promise<{ success: boolean; message: string; conversationId?: string }> {
    try {
      // Validate webhook type
      if (webhookPayload.type !== 'post_call_transcription') {
        this.logger.warn(`Unexpected webhook type: ${webhookPayload.type}`);
        return {
          success: false,
          message: `Unsupported webhook type: ${webhookPayload.type}`,
        };
      }

      // Validate required fields
      if (!webhookPayload.data?.conversation_id) {
        this.logger.error('Missing conversation_id in webhook payload');
        return {
          success: false,
          message: 'Missing conversation_id',
        };
      }

      // Process the webhook data
      await this.webhookService.processElevenLabsWebhook(webhookPayload);

      return {
        success: true,
        message: 'Webhook processed successfully',
        conversationId: webhookPayload.data.conversation_id,
      };
    } catch (error: any) {
      this.logger.error(
        `Error processing ElevenLabs webhook: ${error.message}`,
        error.stack,
      );

      // Still return 200 to acknowledge receipt to ElevenLabs
      // This prevents ElevenLabs from retrying the webhook
      return {
        success: false,
        message: error.message || 'Internal server error',
      };
    }
  }

  @Post('chatbot-post-call')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Receive ElevenLabs post-call webhook for the chatbot agent',
    description:
      'Fires when a chatbot conversation ends. If a user_transfer_query row with queryStatus="pending" exists for the conversation_id, triggers the after-hours human-call flow (same service used by /conversation). No transcript storage, no escalation email — strictly the pending-row → outbound-call trigger.',
  })
  @ApiBody({ type: ElevenLabsWebhookDto })
  async handleChatbotPostCall(
    @Body() webhookPayload: ElevenLabsWebhookDto,
  ): Promise<{
    success: boolean;
    message: string;
    conversationId?: string;
    outcome?: AfterHoursHumanCallOutcome['outcome'];
  }> {
    try {
      this.logger.log(
        `[CHATBOT_POST_CALL] hit: ${JSON.stringify({
          type: webhookPayload?.type,
          conversation_id: webhookPayload?.data?.conversation_id,
        })}`,
      );

      if (webhookPayload.type !== 'post_call_transcription') {
        return {
          success: false,
          message: `Unsupported webhook type: ${webhookPayload.type}`,
        };
      }

      const conversationId = webhookPayload.data?.conversation_id?.trim();
      if (!conversationId) {
        return { success: false, message: 'Missing conversation_id' };
      }

      const result =
        await this.afterHoursPendingHumanCallService.runForConversation(
          conversationId,
        );

      return {
        success: result.outcome === 'connected' || result.outcome === 'skipped',
        message: `Chatbot post-call processed: ${result.outcome}`,
        conversationId,
        outcome: result.outcome,
      };
    } catch (error: any) {
      this.logger.error(
        `[CHATBOT_POST_CALL] error: ${error.message}`,
        error.stack,
      );
      // Always 200 to ElevenLabs so it doesn't retry.
      return {
        success: false,
        message: error.message || 'Internal server error',
      };
    }
  }

  @Post('outbound-call-result')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Receive ElevenLabs post-call webhook for the outbound SmartCaller agent',
    description:
      'Stub endpoint that logs the full ElevenLabs post-call payload to the console. No DB updates, no side effects. Use the dumped payload to design the retry / next-priority / escalation logic.',
  })
  @ApiBody({ type: ElevenLabsWebhookDto })
  async handleOutboundCallResult(
    @Body() webhookPayload: ElevenLabsWebhookDto,
  ): Promise<{ success: boolean; message: string; conversationId?: string }> {
    try {
      const data = webhookPayload.data || {};
      const eventType = webhookPayload.type;
      const agentPhone = data.user_id;
      const reason =
        data.failure_reason ??
        (eventType === 'post_call_transcription' ? 'call_ended' : 'unknown');

      this.logger.log(
        `[OUTBOUND_RESULT] type=${eventType} agent_phone=${agentPhone} reason=${reason}`,
      );

      // Both event types may require advancing to the next priority agent:
      //  - call_initiation_failure: agent never picked up → retry SAME agent up
      //    to MAX_ATTEMPTS_PER_AGENT, then advance.
      //  - post_call_transcription: the call was "answered" — but that includes
      //    the recipient's VOICEMAIL / a call that ended without the agent
      //    actually engaging. Only a genuine human decline should skip retries;
      //    voicemail / no-real-answer must be retried like a missed call.
      if (agentPhone && eventType === 'call_initiation_failure') {
        const advance =
          await this.afterHoursPendingHumanCallService.advanceToNextAgentByPhone(
            agentPhone,
            reason,
          );
        this.logger.log(
          `[OUTBOUND_RESULT] advance outcome → ${JSON.stringify(advance)}`,
        );
      } else if (agentPhone && eventType === 'post_call_transcription') {
        // Only a genuine human decline skips the agent's remaining attempts.
        // Voicemail, a ring-out and an auto-reject all arrive as
        // `post_call_transcription` too, and every one of those is a missed
        // attempt that must be retried.
        const declined = this.didAgentGenuinelyDecline(data);
        const skipRetry = declined;
        this.logger.log(
          `[OUTBOUND_RESULT] post_call_transcription agent_phone=${agentPhone} genuineDecline=${declined} → skipRetry=${skipRetry}`,
        );
        const advance =
          await this.afterHoursPendingHumanCallService.advanceToNextAgentByPhone(
            agentPhone,
            declined ? 'agent_declined' : `no_answer(${reason})`,
            { skipRetry },
          );
        this.logger.log(
          `[OUTBOUND_RESULT] advance outcome (skipRetry=${skipRetry}) → ${JSON.stringify(advance)}`,
        );
      }

      return {
        success: true,
        message: 'Outbound call result handled',
        conversationId: data.conversation_id,
      };
    } catch (error: any) {
      this.logger.error(
        `[OUTBOUND_RESULT] error handling payload: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        message: error.message || 'Internal server error',
      };
    }
  }

  /**
   * A call must last at least this long before a `post_call_transcription`
   * could plausibly represent a human hearing the request and turning it down.
   *
   * The agent's own opening line takes several seconds to speak, so anything
   * shorter cannot contain a decision — it is a ring-out, an auto-reject, or a
   * carrier drop.
   */
  private static readonly MIN_DECLINE_DURATION_SECS = 15;

  /**
   * Termination reasons that prove nobody engaged, whatever the transcript says.
   *
   * ElevenLabs ends a call for silence when the line was answered but no one
   * ever responded — a ring-through to an unattended handset, an IVR, or a
   * carrier's hold music. Its own reason string is the only field that states
   * this outright, and it outranks every other signal.
   */
  private static readonly NON_ENGAGEMENT_TERMINATIONS = [
    'voicemail',
    'silence',
    'no response',
    'no answer',
    'timed out',
    'timeout',
  ];

  /**
   * Did a HUMAN actually take this call and turn the job down?
   *
   * Only a genuine decline may skip the remaining retries. Everything else —
   * voicemail, ring-out, auto-reject, carrier drop — is a missed attempt and
   * must be retried, exactly like `call_initiation_failure`.
   *
   * This replaces an earlier `didCallGoToVoicemail` check that asked the
   * narrower question "was this voicemail?" and treated every other
   * `post_call_transcription` as a decline. That is what broke the client's
   * escalation: P2 was called once, ElevenLabs posted a transcription 8
   * seconds later (nobody picked up, no voicemail marker), and the run
   * advanced straight to P3 — so P2 got 1 attempt where P1 and P3 each
   * correctly got 3.
   *
   * A decline requires ALL of:
   *   1. `termination_reason` does not state non-engagement (silence, voicemail,
   *      no answer, timeout) — this VETO outranks everything else,
   *   2. the call lasted long enough for a person to hear and answer, and
   *   3. the recipient actually said something in the transcript.
   *
   * The veto is what the first version of this fix was missing. A transcript
   * "user" turn is NOT proof a human spoke: ElevenLabs transcribes whatever
   * audio the line carries into the `user` role, so an unattended handset, an
   * IVR or hold music all produce user turns. In the 05:55 run P2 never
   * answered, yet the transcript held `"See if this person is available."` and
   * `"Please stay on the line."` as user turns — so `recipientSpoke` was true,
   * the call was ruled a decline, and P2 lost its remaining 2 attempts.
   * `termination_reason` was the one field that told the truth:
   * "Ending conversation after 10 seconds of silence."
   *
   * Deliberately biased towards "not a decline": a wrong retry costs one extra
   * call, a wrong skip loses an agent's remaining attempts and, as here, is
   * reported as a P1 defect by the client.
   */
  private didAgentGenuinelyDecline(data: unknown): boolean {
    try {
      const payload = (data ?? {}) as {
        metadata?: {
          termination_reason?: unknown;
          call_duration_secs?: unknown;
        };
        transcript?: unknown;
      };

      const termination = String(
        payload.metadata?.termination_reason ?? '',
      ).toLowerCase();

      // VETO — ElevenLabs itself says nobody engaged. Outranks the transcript,
      // which cannot distinguish a human from an IVR or hold music.
      const nonEngagement = WebhookController.NON_ENGAGEMENT_TERMINATIONS.find(
        (marker): boolean => termination.includes(marker),
      );
      if (nonEngagement) {
        this.logger.log(
          `[OUTBOUND_RESULT] decline check → NOT a decline: termination says "${nonEngagement}" (full: "${termination}")`,
        );
        return false;
      }

      const transcript: TranscriptTurn[] = Array.isArray(payload.transcript)
        ? (payload.transcript as TranscriptTurn[])
        : [];

      // VETO — the call never became a conversation.
      //
      // A person who takes the call answers the opening "Am I speaking with
      // <agent>?", hears the job, and responds: the exchange keeps going. A
      // voicemail produces the opposite shape — the agent talks, one or two
      // stray turns come back, and it ends. Measured on TURN COUNT rather than
      // on what the words say, because the words cannot be trusted: ASR files
      // whatever audio the line carries under the `user` role, and in the 05:55
      // run a voicemail produced "See if this person is available." and
      // "Please stay on the line." — neither spoken by anyone.
      //
      // Word matching was tried first and is too brittle: ASR can equally
      // return "Hmm okay right" for the same greeting, which no keyword list
      // would catch. Structure survives that; wording does not.
      //
      // Note this is NOT a failure of ElevenLabs' voicemail_detection. Its
      // tool fires on documented phrases ("please leave a message after the
      // beep"), and none of those were transcribed here — so `used: false` is
      // correct behaviour, and the gap has to be closed on our side.
      const MIN_ENGAGED_TURNS = 6;
      if (transcript.length > 0 && transcript.length < MIN_ENGAGED_TURNS) {
        this.logger.log(
          `[OUTBOUND_RESULT] decline check → NOT a decline: only ${transcript.length} transcript turn(s), no real exchange took place`,
        );
        return false;
      }

      // The voicemail-detection system tool fired — never a decline.
      for (const turn of transcript) {
        const toolCalls = Array.isArray(turn?.tool_calls)
          ? turn.tool_calls
          : [];
        for (const tc of toolCalls) {
          const name = String(tc?.tool_name ?? tc?.name ?? '').toLowerCase();
          if (name.includes('voicemail')) {
            return false;
          }
        }
      }

      // Signal 1 — long enough for a person to have heard and responded.
      const durationSecs = Number(payload.metadata?.call_duration_secs ?? 0);
      const longEnough =
        Number.isFinite(durationSecs) &&
        durationSecs >= WebhookController.MIN_DECLINE_DURATION_SECS;

      // Signal 2 — something came back down the line. Necessary but NOT
      // sufficient on its own: ElevenLabs files any audio it hears under the
      // `user` role, so an IVR or hold music also produces user turns. The
      // termination veto above is what separates those from a real person.
      const recipientSpoke = transcript.some((turn): boolean => {
        const role = String(turn?.role ?? '').toLowerCase();
        const message = String(turn?.message ?? '').trim();
        return role === 'user' && message.length > 0;
      });

      this.logger.log(
        `[OUTBOUND_RESULT] decline check → durationSecs=${durationSecs} longEnough=${longEnough} recipientSpoke=${recipientSpoke} termination="${termination}"`,
      );

      return longEnough && recipientSpoke;
    } catch {
      // Unknown payload shape → treat as NOT a decline, so the agent keeps its
      // remaining attempts. Never crash the webhook.
      return false;
    }
  }

  @Get('dealer')
  @ApiOperation({ summary: 'Get dealer with agents by dealer code' })
  @ApiQuery({ name: 'dealerCode', description: 'Dealer code' })
  async getDealerWithAgentsByCode(
    @Query('dealerCode') dealerCode: string,
  ): Promise<IWebhookDealerWithAgents> {
    return await this.webhookService.getDealerWithAgentsByCode(dealerCode);
  }

  @Post('after-hours-pending-human-call')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'After-hours: pending transfer query → site → dealer agents → ElevenLabs outbound (P1 then P2…)',
    description:
      'For testing or retries. Same pipeline as post-call webhook tail: finds user_transfer_query pending for conversation_id, resolves siteName → dealer agents, sequential ElevenLabs outbound until success or list exhausted.',
  })
  @ApiBody({ type: AfterHoursPendingHumanCallDto })
  @ApiResponse({
    status: 200,
    description: 'Outcome of the outbound chain',
  })
  async afterHoursPendingHumanCall(
    @Body() body: AfterHoursPendingHumanCallDto,
  ): Promise<{ success: boolean; result: AfterHoursHumanCallOutcome }> {
    this.logger.log(
      `[AFTER_HOURS_ENDPOINT] hit POST /webhooks/after-hours-pending-human-call body=${JSON.stringify(body)}`,
    );
    const result =
      await this.afterHoursPendingHumanCallService.runForConversation(
        body.conversation_id,
      );
    this.logger.log(
      `[AFTER_HOURS_ENDPOINT] result for conversation_id="${body.conversation_id}" → ${JSON.stringify(result)}`,
    );
    const ok = result.outcome === 'connected' || result.outcome === 'skipped';
    return { success: ok, result };
  }

  @Post('share-caller-details')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'ElevenLabs tool: email caller details to the human agent on the line',
    description:
      'Called as a server tool by the SmartCaller outbound agent after the human agent confirms availability. Looks up user_transfer_query by conversation_id, sends caller details + query to agent_email, marks the row resolved. Requires x-tool-secret header matching SHARE_CALLER_DETAILS_TOOL_SECRET.',
  })
  @ApiBody({ type: ShareCallerDetailsDto })
  @ApiResponse({ status: 200, description: 'Email outcome' })
  async shareCallerDetails(
    @Body() body: ShareCallerDetailsDto,
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.shareCallerDetailsService.share(
      body.conversation_id,
      body.agent_email,
    );
    return { success: result.success, message: result.message };
  }

  @Post('test-escalation-email')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Test escalation email (DEV ONLY)',
    description: 'Test endpoint to send escalation email directly',
  })
  async testEscalationEmail(
    @Body()
    body: {
      callerName: string;
      callerEmail: string;
      callerPhone: string;
      callbackNumber?: string;
      dealerCode?: string;
      callSummary?: string;
      callTranscript?: string;
    },
  ): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.emailService.sendEscalationEmail({
        callerName: body.callerName || 'Test User',
        callerEmail: body.callerEmail || 'customer@example.com',
        callerPhone: body.callerPhone || '+1234567890',
        callbackNumber:
          body.callbackNumber || body.callerPhone || '+1234567890',
        dealerCode: body.dealerCode,
        callSummary:
          body.callSummary ||
          'This is a test call summary. The caller inquired about service availability.',
        callTranscript:
          body.callTranscript ||
          '[0:00] AI Agent: Hello, how can I help you?\n\n[0:05] Caller: Hi, this is a test call.',
      });

      return {
        success: result.success,
        message: result.success
          ? `Email sent! MessageId: ${result.messageId}`
          : `Failed: ${result.error}`,
      };
    } catch (error: any) {
      this.logger.error(`[TEST] Error: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @Post('transfer-call')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Transfer call to advisor using Twilio conference',
    description:
      'Transfers an active call to an advisor by creating a Twilio conference and connecting both parties. Requires Content-Type: application/json header.',
  })
  @ApiBody({ type: TransferRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Transfer response',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async transferCall(@Body() transferRequest: TransferRequestDto): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const result = await this.webhookService.transferCall(transferRequest);
      return result;
    } catch (error: any) {
      this.logger.error(
        `Error transferring call: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        message: 'Failed to transfer call. Please try again.',
      };
    }
  }

  @Post('transfer-query')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Store transfer query (conversation, caller, site, optional transfer fields)',
    description:
      'All body fields are optional; omitted fields are stored as null. query_status is always created as pending. Use PATCH /webhooks/transfer-query/:id to fill in agent_query, etc. later.',
  })
  @ApiBody({ type: CreateUserTransferQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Created record id and status',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        id: { type: 'string', format: 'uuid' },
        query_status: {
          type: 'string',
          enum: ['pending', 'resolved', 'escalated'],
        },
      },
    },
  })
  async createTransferQuery(@Body() body: CreateUserTransferQueryDto): Promise<{
    success: boolean;
    message: string;
    id?: string;
    query_status?: string;
  }> {
    try {
      const { id, queryStatus } =
        await this.userTransferQueryService.create(body);
      return {
        success: true,
        message: 'Transfer query saved',
        id,
        query_status: queryStatus,
      };
    } catch (error: any) {
      this.logger.error(
        `Error saving transfer query: ${error.message}`,
        error.stack,
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      return {
        success: false,
        message: error.message || 'Failed to save transfer query',
      };
    }
  }

  @Post('return-request')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Submit a return / RMA request (chatbot agent tool)',
    description:
      'Called by the ElevenLabs agent at the end of the RETURN flow. Resolves the lead/session from conversation_id, persists the return request, and emails the support inbox. product_name is required; order_id, reason_for_return, return_address are optional (stored as "Not provided" if omitted).',
  })
  @ApiBody({ type: CreateWebhookReturnRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Submission result',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        id: { type: 'string', format: 'uuid' },
      },
    },
  })
  async createReturnRequest(
    @Body() body: CreateWebhookReturnRequestDto,
  ): Promise<{ success: boolean; message: string; id?: string }> {
    return await this.returnRequestService.submitFromConversation(body);
  }

  @Post('appointment')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Book an appointment (chatbot agent tool)',
    description:
      'Called by the ElevenLabs agent (book_appointment). Resolves the lead/session from conversation_id, persists the appointment and emails the appointment inbox. The agent gathers and sanity-checks the date, time and callback number in conversation.',
  })
  @ApiBody({ type: CreateWebhookAppointmentDto })
  @ApiResponse({
    status: 200,
    description: 'Submission result',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        id: { type: 'string' },
      },
    },
  })
  async createAppointment(
    @Body() body: CreateWebhookAppointmentDto,
  ): Promise<{ success: boolean; message: string; id?: string }> {
    return await this.appointmentService.submitFromConversation(body);
  }

  @Post('department-callback')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Submit a business-hours department callback (chatbot agent tool)',
    description:
      'Called by the ElevenLabs agent (submit_department_callback) on the business-hours path. Resolves the lead/session from conversation_id and emails the chosen department inbox (Sales/Service/Account) plus the user.',
  })
  @ApiBody({ type: CreateWebhookDepartmentCallbackDto })
  @ApiResponse({
    status: 200,
    description: 'Submission result',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async createDepartmentCallback(
    @Body() body: CreateWebhookDepartmentCallbackDto,
  ): Promise<{ success: boolean; message: string }> {
    return await this.departmentCallbackService.submitFromConversation(body);
  }

  @Patch('transfer-query/:id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Partially update transfer query',
    description:
      'Send only fields to change (e.g. agent_query, site_name, query_status). Omitted keys are left unchanged.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateUserTransferQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Updated record',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        id: { type: 'string' },
        query_status: { type: 'string' },
      },
    },
  })
  async updateTransferQuery(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserTransferQueryDto,
  ): Promise<{
    success: boolean;
    message: string;
    id?: string;
    query_status?: string;
  }> {
    try {
      const { id: savedId, queryStatus } =
        await this.userTransferQueryService.update(id, body);
      return {
        success: true,
        message: 'Transfer query updated',
        id: savedId,
        query_status: queryStatus,
      };
    } catch (error: any) {
      this.logger.error(
        `Error updating transfer query: ${error.message}`,
        error.stack,
      );
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      return {
        success: false,
        message: error.message || 'Failed to update transfer query',
      };
    }
  }

  @Patch('transfer-query/:id/status')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Update transfer query status',
    description: 'Set query_status to pending, resolved, or escalated.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateUserTransferQueryStatusDto })
  @ApiResponse({
    status: 200,
    description: 'Updated status',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        id: { type: 'string' },
        query_status: { type: 'string' },
      },
    },
  })
  async updateTransferQueryStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserTransferQueryStatusDto,
  ): Promise<{
    success: boolean;
    message: string;
    id?: string;
    query_status?: string;
  }> {
    const { id: savedId, queryStatus } =
      await this.userTransferQueryService.updateStatus(id, body);
    return {
      success: true,
      message: 'Status updated',
      id: savedId,
      query_status: queryStatus,
    };
  }

  // === Twilio agent dial + AMD webhooks ===

  @Get('twilio/agent-dial')
  @Header('Content-Type', 'text/xml')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Twilio: initial agent dial with AMD',
    description:
      'Twilio fetches this URL to dial the human agent number with Answering Machine Detection before joining the conference.',
  })
  @ApiQuery({
    name: 'conference',
    required: true,
    description: 'Conference name to join on human answer',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'Destination phone number for the human agent',
  })
  async twilioAgentDial(
    @Query('conference') conference: string,
    @Query('to') to: string,
  ): Promise<string> {
    const logger = this.logger;

    // No Say — agent goes straight to Dial (no "Incoming transfer call" / "Transferring incoming calls" audio)
    const baseUrl =
      process.env.PUBLIC_API_URL?.replace(/\/+$/, '') ||
      process.env.BASE_URL?.replace(/\/+$/, '');

    const actionUrl = baseUrl
      ? `${baseUrl}/webhooks/twilio/agent-dial-status?conference=${encodeURIComponent(conference)}`
      : `/webhooks/twilio/agent-dial-status?conference=${encodeURIComponent(conference)}`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnMedia="false" machineDetection="Enable" machineDetectionTimeout="12" machineDetectionSpeechThreshold="2400" machineDetectionSpeechEndThreshold="800" machineDetectionSilenceTimeout="8000" action="${actionUrl}" method="POST">
    <Number>${to}</Number>
  </Dial>
</Response>`;

    return twiml;
  }

  @Post('twilio/agent-dial-status')
  @Header('Content-Type', 'text/xml')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Twilio: agent dial AMD result',
    description:
      'Twilio posts here after AMD finishes. If AnsweredBy=human we join the conference; if machine/voicemail, we hang up.',
  })
  @ApiQuery({
    name: 'conference',
    required: true,
    description: 'Conference name associated with this agent leg',
  })
  async twilioAgentDialStatus(
    @Query('conference') conference: string,
    @Body() body: any,
  ): Promise<string> {
    const answeredByRaw = body?.AnsweredBy;
    const answeredBy =
      typeof answeredByRaw === 'string'
        ? answeredByRaw.trim().toLowerCase()
        : '';

    const hangupTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;

    // Only hang up on CONFIRMED machine/fax results. Silent humans return `unknown`
    // (or empty) — we now bridge those through to avoid cutting off real callers
    // who picked up but haven't said "Hello?" yet. Voicemail systems always start
    // a prompt within the silence window, so they'll be classified as machine_*.
    const confirmedMachine = new Set([
      'machine_start',
      'machine_end_beep',
      'machine_end_silence',
      'machine_end_other',
      'fax',
    ]);
    if (confirmedMachine.has(answeredBy)) {
      return hangupTwiml;
    }

    // Human detected: join the existing conference. We do not play any extra prompt here;
    // the CallTransferService has already put the caller into the same conference.
    const conferenceTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference endConferenceOnExit="true" beep="false" waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical">${conference}</Conference>
  </Dial>
</Response>`;

    return conferenceTwiml;
  }

  @Post('twilio/conference-ended')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Twilio: conference ended (e.g. caller hung up during ring)',
    description:
      'Hang up the agent leg so they stop ringing when the caller disconnects before the agent answers.',
  })
  async twilioConferenceEnded(@Body() body: any): Promise<void> {
    // Twilio sends FriendlyName (PascalCase); accept friendly_name if form-encoded
    const friendlyName = body?.FriendlyName ?? body?.friendly_name;
    const conferenceSid = body?.ConferenceSid ?? body?.conference_sid;
    const callSidEndingConference =
      body?.CallSidEndingConference ?? body?.call_sid_ending_conference;
    if (friendlyName) {
      await this.callTransferService.hangUpAgentForConference(friendlyName, {
        ConferenceSid: conferenceSid,
        CallSidEndingConference: callSidEndingConference,
      });
    } else {
      this.logger.warn(
        `[Twilio] /twilio/conference-ended missing FriendlyName in body: ${JSON.stringify(body)}`,
      );
    }
  }
}
