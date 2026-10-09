import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dealer, HumanAgent } from '@/schema';
import { IWebhookDealerWithAgents } from '@/types/webhook';
import { CallHistoryService } from '@/callHistory/callHistoryService';
import { CallTranscriptService } from '@/callTranscript/callTranscriptService';
import { ElevenLabsWebhookDto, TransferRequestDto } from '@/webhooks/dto';
import { SSEService } from '@/sse/sseService';
import { CallTransferService } from '@/webhooks/callTransferService';
import { CallDataFormatter } from '@/helper/callDataFormatter';
import { EmailService } from '@/helper/email-service';
import { AfterHoursPendingHumanCallService } from '@/webhooks/afterHoursPendingHumanCallService';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(Dealer)
    private readonly dealerRepository: Repository<Dealer>,
    @InjectRepository(HumanAgent)
    private readonly humanAgentRepository: Repository<HumanAgent>,
    private readonly callHistoryService: CallHistoryService,
    private readonly callTranscriptService: CallTranscriptService,
    private readonly sseService: SSEService,
    private readonly callTransferService: CallTransferService,
    private readonly emailService: EmailService,
    private readonly afterHoursPendingHumanCallService: AfterHoursPendingHumanCallService,
  ) {}

  /**
   * Process ElevenLabs webhook data and create call history + transcript
   * This is the main method that handles incoming webhooks from ElevenLabs
   * @param webhookPayload - The complete webhook payload from ElevenLabs
   */
  async processElevenLabsWebhook(
    webhookPayload: ElevenLabsWebhookDto,
  ): Promise<void> {
    this.logger.log('='.repeat(60));
    this.logger.log('=== WEBHOOK RECEIVED ===');
    this.logger.log('='.repeat(60));
    this.logger.log(`Payload type: ${webhookPayload.type}`);
    this.logger.log(`Payload data exists: ${!!webhookPayload.data}`);

    try {
      const { data } = webhookPayload;
      this.logger.log(
        `[DEBUG] Data object: ${JSON.stringify(data).substring(0, 200)}...`,
      );

      // Extract conversation ID - critical field
      const conversationId = data.conversation_id;
      this.logger.log(`[DEBUG] conversation_id: ${conversationId}`);
      if (!conversationId) {
        throw new Error('Conversation ID not found in webhook payload');
      }

      // Extract call date time from Unix timestamp - critical field
      const startTimeUnixSecs = data.metadata?.start_time_unix_secs;
      if (!startTimeUnixSecs) {
        throw new Error('Call date time not found in webhook payload');
      }
      const callDateTime = new Date(startTimeUnixSecs * 1000).toISOString();

      // Extract data collection results
      const dataCollectionResults =
        data.analysis?.data_collection_results || {};

      // Extract transcript summary from analysis - optional
      const transcriptSummary = data.analysis?.transcript_summary || null;
      if (!transcriptSummary) {
        this.logger.warn(
          `Transcript summary not found for conversation ${conversationId}, will store as NULL`,
        );
      }

      // Extract caller name - optional
      const callerName = dataCollectionResults.name?.value || null;
      if (!callerName) {
        this.logger.warn(
          `Caller name not found for conversation ${conversationId}, will store as NULL`,
        );
      }

      // Extract caller email - optional
      const callerEmail = dataCollectionResults.email?.value || null;
      if (!callerEmail) {
        this.logger.warn(
          `Caller email not found for conversation ${conversationId}, will store as NULL`,
        );
      }

      const rawCallbackRequested =
        dataCollectionResults.callback_requested?.value;
      const callbackRequested =
        rawCallbackRequested === true ||
        rawCallbackRequested === 'true' ||
        rawCallbackRequested === 'TRUE' ||
        rawCallbackRequested === 'yes' ||
        rawCallbackRequested === 'Yes' ||
        rawCallbackRequested === '1';

      const customerPhoneNumber =
        dataCollectionResults['phone Number']?.value ||
        dataCollectionResults['phone number']?.value ||
        dataCollectionResults.phone_number?.value ||
        dataCollectionResults.phoneNumber?.value ||
        null;

      const rawCallbackNumber =
        dataCollectionResults.callback_number?.value ||
        dataCollectionResults['callback number']?.value ||
        dataCollectionResults.callbackNumber?.value ||
        null;

      // Extract phone number from metadata - optional (using snake_case)
      const phoneNumber = data.metadata?.phone_call?.agent_number || null;
      if (!phoneNumber) {
        this.logger.warn(
          `Phone number not found for conversation ${conversationId}, will store as NULL`,
        );
      }

      // Extract caller number from metadata.phone_call.external_number - optional
      const fallbackCallingNumber =
        data.metadata?.phone_call?.external_number || null;
      const callerNumber = customerPhoneNumber || fallbackCallingNumber;
      const callbackNumber = rawCallbackNumber || callerNumber || null;

      // Extract and format duration (using snake_case)
      const callDurationSecs = data.metadata?.call_duration_secs || 0;
      const duration = CallDataFormatter.formatDuration(callDurationSecs);

      // Extract facility from dealer code (will be overridden by working-hours tool result when available)
      const dealerCode = dataCollectionResults['dealer code']?.value;
      let facility: string | null = dealerCode ? String(dealerCode) : null;

      /**
       * NEW LOGIC:
       * Use the working-hours tool result from the transcript (get_working_hours_info)
       * to derive:
       *  - currentMode: 'businessHours' | 'afterHours'
       *  - after-hours flag
       *  - whether to keep or clear facility (dealer code)
       *
       * Rules:
       *  - If currentMode === 'businessHours':
       *      - afterHours should be treated as FALSE (business hours call)
       *      - facility should be empty (no dealer code stored)
       *  - If currentMode === 'afterHours':
       *      - afterHours should be treated as TRUE (after-hours call)
       *      - facility should contain ONLY the dealer code (if present)
       */
      let afterHoursFromTool: 'Yes' | 'No' | null = null;
      let siteInfoForEmail: {
        siteName?: string | null;
        email?: string | null;
        contactNumber?: string | null;
        assignedDealer?: {
          dealerCode?: string | null;
          dealerName?: string | null;
          phone?: string | null;
          email?: string | null;
        } | null;
      } | null = null;
      try {
        const transcript = data.transcript || [];

        // Find the first tool_results entry for the working-hours tool.
        // Accept both the current name (get_working_hours_information) and the
        // legacy short name (get_working_hours_info) so old transcripts still parse.
        let workingHoursTool: any | null = null;
        let siteInfoTool: any | null = null;
        if (Array.isArray(transcript)) {
          for (const item of transcript) {
            if (!item || !Array.isArray(item.tool_results)) continue;
            const workingHoursMatch = item.tool_results.find(
              (tr: any) =>
                tr &&
                (tr.tool_name === 'get_working_hours_information' ||
                  tr.toolName === 'get_working_hours_information' ||
                  tr.tool_name === 'get_working_hours_info' ||
                  tr.toolName === 'get_working_hours_info'),
            );
            if (workingHoursMatch && !workingHoursTool) {
              workingHoursTool = workingHoursMatch;
            }

            const siteInfoMatch = item.tool_results.find(
              (tr: any) =>
                tr &&
                (tr.tool_name === 'get_site_info' ||
                  tr.toolName === 'get_site_info'),
            );
            if (siteInfoMatch && !siteInfoTool) {
              siteInfoTool = siteInfoMatch;
            }

            if (workingHoursTool && siteInfoTool) {
              break;
            }
          }
        }

        if (workingHoursTool) {
          const rawValue =
            workingHoursTool.result_value || workingHoursTool.value || null;
          if (rawValue && typeof rawValue === 'string') {
            try {
              const parsed = JSON.parse(rawValue);
              const currentMode =
                parsed.currentMode || parsed.current_mode || null;

              if (currentMode === 'businessHours') {
                afterHoursFromTool = 'No';
                facility = null; // business hours -> no dealer code in facility column
              } else if (currentMode === 'afterHours') {
                afterHoursFromTool = 'Yes';
                // for afterHours we keep facility as dealerCode (if any), which is already set above
              }
            } catch (parseErr: any) {
              this.logger.warn(
                `Failed to parse get_working_hours_info.result_value: ${parseErr.message}`,
              );
            }
          }
        }

        if (siteInfoTool) {
          const rawValue =
            siteInfoTool.result_value || siteInfoTool.value || null;
          if (rawValue && typeof rawValue === 'string') {
            try {
              const parsed = JSON.parse(rawValue);
              const siteInfo = Array.isArray(parsed) ? parsed[0] : parsed;

              if (siteInfo && typeof siteInfo === 'object') {
                siteInfoForEmail = {
                  siteName: siteInfo.siteName || null,
                  email: siteInfo.email || null,
                  contactNumber: siteInfo.contactNumber || null,
                  assignedDealer: siteInfo.assignedDealer
                    ? {
                        dealerCode: siteInfo.assignedDealer.dealerCode || null,
                        dealerName: siteInfo.assignedDealer.dealerName || null,
                        phone: siteInfo.assignedDealer.phone || null,
                        email: siteInfo.assignedDealer.email || null,
                      }
                    : null,
                };
              }
            } catch (parseErr: any) {
              this.logger.warn(
                `Failed to parse get_site_info.result_value: ${parseErr.message}`,
              );
            }
          }
        }
      } catch (toolErr: any) {
        this.logger.warn(
          `Error while reading tool results: ${toolErr.message}`,
        );
      }

      // Extract and map feedback value
      const feedbackValue = dataCollectionResults.feedback?.value;
      const feedback = CallDataFormatter.mapFeedbackValue(feedbackValue);

      // Extract rationale - if feedback is null/undefined, set rationale to "No feedback provided by the user"
      // Otherwise, use the rationale from the webhook
      let rationale: string | null;
      if (!feedback || feedback === undefined) {
        rationale = 'No feedback provided by the user';
      } else {
        rationale = dataCollectionResults.feedback?.rationale || null;
      }

      // Extract transfer information (using snake_case)
      const featuresUsage = data.metadata?.features_usage || {};
      const isTransferred =
        featuresUsage.transfer_to_agent?.used === true ||
        featuresUsage.transfer_to_number?.used === true;

      // Check if call history already exists (created during transfer)
      const existingCallHistory =
        await this.callHistoryService.findByConversationId(
          String(conversationId),
        );

      // Log fetched call history
      this.logger.log('='.repeat(60));
      this.logger.log('📋 FETCHED EXISTING CALL HISTORY:');
      this.logger.log('='.repeat(60));
      if (existingCallHistory) {
        this.logger.log(`   🆔 ID:              ${existingCallHistory.id}`);
        this.logger.log(
          `   🔗 Conversation ID: ${existingCallHistory.conversationId}`,
        );
        this.logger.log(
          `   📊 isEscalation:    ${existingCallHistory.isEscalation}`,
        );
        this.logger.log(
          `   🔄 isTransferred:   ${existingCallHistory.isTransferred}`,
        );
        this.logger.log(
          `   📞 callStatus:      ${existingCallHistory.callStatus}`,
        );
        this.logger.log(
          `   👤 humanAgentName:  ${existingCallHistory.humanAgentName}`,
        );
        this.logger.log(
          `   📅 callDateTime:    ${existingCallHistory.callDateTime}`,
        );
      } else {
        this.logger.log(
          '   ❌ No existing call history found for this conversation',
        );
      }
      this.logger.log('='.repeat(60));

      // Log caller details
      this.logger.log('='.repeat(60));
      this.logger.log('📞 CALLER DETAILS EXTRACTED:');
      this.logger.log('='.repeat(60));
      this.logger.log(`   👤 Caller Name:    ${callerName || 'Not provided'}`);
      this.logger.log(`   📧 Caller Email:   ${callerEmail || 'Not provided'}`);
      this.logger.log(
        `   📱 Caller Contact: ${callerNumber || 'Not provided'}`,
      );
      this.logger.log(
        `   📞 Callback No:    ${callbackNumber || 'Not provided'}`,
      );
      this.logger.log(
        `   ☎️ Callback Req:  ${callbackRequested ? 'Yes' : 'No'}`,
      );
      this.logger.log(
        `   🏢 Dealer Code:    ${dataCollectionResults['dealer code']?.value || 'Not provided'}`,
      );
      this.logger.log(
        `   📝 Call Summary:   ${transcriptSummary ? transcriptSummary.substring(0, 100) + '...' : 'Not provided'}`,
      );
      this.logger.log('='.repeat(60));

      // NOTE: Escalation email is now sent AFTER this webhook is processed,
      // once full caller details and transcript have been stored.

      // Helper function to normalize isEscalation to enum value (handle legacy boolean values)
      const normalizeIsEscalation = (
        value: any,
      ): 'not-requested' | 'successful' | 'unsuccessful' => {
        if (
          value === 'not-requested' ||
          value === 'successful' ||
          value === 'unsuccessful'
        ) {
          return value;
        }
        // Handle legacy boolean values or undefined
        if (value === false || value === 'false') {
          return 'not-requested';
        }
        if (value === true || value === 'true') {
          return 'successful';
        }
        return 'not-requested';
      };

      // Determine who handled the call
      // If human agent picked up (humanAgentName exists), use agent name
      // Otherwise, set to "AI-agent"
      const handledBy = existingCallHistory?.humanAgentName
        ? existingCallHistory.humanAgentName
        : 'AI-agent';

      // Determine afterHours display value
      // Priority:
      //  1) working-hours tool result (afterHoursFromTool)
      //  2) legacy metadata.after_hours (afterHoursBool)
      const afterHoursBool =
        data.metadata?.after_hours !== undefined
          ? data.metadata.after_hours
          : false;
      const defaultAfterHours = afterHoursBool ? 'Yes' : 'No';
      const finalAfterHours: string | null =
        afterHoursFromTool ?? defaultAfterHours;
      const resolvedEscalationStatus =
        existingCallHistory?.isEscalation !== undefined
          ? normalizeIsEscalation(existingCallHistory.isEscalation)
          : callbackRequested
            ? 'unsuccessful'
            : 'not-requested';
      const callHistoryData = {
        conversationId: String(conversationId),
        callerName: callerName ? String(callerName) : null,
        callerEmail: callerEmail ? String(callerEmail) : null,
        phoneNumber: phoneNumber ? String(phoneNumber) : null,
        callDateTime,
        duration: duration || null,
        afterHours: finalAfterHours,
        facility: facility || null,
        // Already parsed above for the notification email; kept here so Call
        // History can show the site the caller actually named.
        siteName: siteInfoForEmail?.siteName || null,
        feedback: feedback,
        handledBy: handledBy,
        isTransferred:
          existingCallHistory?.isTransferred !== undefined
            ? existingCallHistory.isTransferred
            : isTransferred,
        rationale: rationale ? String(rationale) : null,
        // Preserve agent data if it exists
        humanAgentName: existingCallHistory?.humanAgentName || null,
        callerNumber: callerNumber || existingCallHistory?.callerNumber || null,
        isEscalation: resolvedEscalationStatus,
        // Preserve callStatus if it exists (set during transfer)
        // If call was transferred and agent picked up, callStatus should be 'answered'
        // If call was transferred but no agent picked up, callStatus should be 'not-answered'
        // If call was not transferred, callStatus should be null
        callStatus: existingCallHistory?.callStatus || null,
        // Store transcript summary from analysis
        callSummary: transcriptSummary ? String(transcriptSummary) : null,
      };

      // Create or update call history entry
      this.logger.log(
        `[DEBUG] Creating call history for conversation: ${conversationId}`,
      );
      this.logger.log(
        `[DEBUG] Call history data: ${JSON.stringify(callHistoryData).substring(0, 300)}...`,
      );

      const createdCallHistory =
        await this.callHistoryService.createOrUpdateByConversationId(
          String(conversationId),
          callHistoryData,
        );

      this.logger.log(
        `[DEBUG] ✅ Call history created/updated! ID: ${createdCallHistory.id}`,
      );
      this.logger.log(
        `[DEBUG] isEscalation: ${createdCallHistory.isEscalation}`,
      );

      // Emit SSE event to notify connected clients
      try {
        this.sseService.emitCallHistoryCreated(
          conversationId,
          createdCallHistory,
        );
      } catch (error: any) {
        // Don't fail the webhook if SSE fails
        this.logger.warn(`⚠️ Failed to emit SSE event: ${error.message}`);
      }

      // Create transcript if available
      const rawTranscript = data.transcript || null;
      if (conversationId && rawTranscript && Array.isArray(rawTranscript)) {
        try {
          const formattedTranscript =
            CallDataFormatter.formatTranscript(rawTranscript);

          await this.callTranscriptService.create({
            conversationId: String(conversationId),
            transcript: formattedTranscript,
          });
        } catch (error: any) {
          this.logger.error(
            `Error creating call transcript for ${conversationId}: ${error.message}`,
          );
        }
      }

      // Callback email: send when we need to follow up because the user did not get through to an agent,
      // OR when analysis explicitly says a callback was requested.
      // Do NOT send when transfer completed (user already spoke to an agent).
      const transferCompleted =
        createdCallHistory.callStatus === 'answered' &&
        createdCallHistory.isTransferred === true;

      const callbackRequestedWithoutTransfer =
        callbackRequested &&
        createdCallHistory.isTransferred === false &&
        createdCallHistory.callStatus !== 'answered';

      const shouldSendCallbackEmail =
        !transferCompleted && callbackRequestedWithoutTransfer;

      this.logger.log(
        `[EMAIL_DECISION] conversationId=${conversationId} shouldSend=${shouldSendCallbackEmail} transferCompleted=${transferCompleted} callbackRequestedWithoutTransfer=${callbackRequestedWithoutTransfer} callStatus=${createdCallHistory.callStatus} isTransferred=${createdCallHistory.isTransferred} isEscalation=${createdCallHistory.isEscalation} callbackRequested=${callbackRequested}`,
      );

      if (shouldSendCallbackEmail) {
        this.logger.log(
          `[EMAIL] Preparing callback email for conversation ${conversationId} (callStatus=${createdCallHistory.callStatus}, isEscalation=${createdCallHistory.isEscalation}, callbackRequested=${callbackRequested}, reason=callback-requested)`,
        );

        let formattedTranscriptForEmail: string | undefined;
        try {
          const transcriptData =
            await this.callTranscriptService.findByConversationId(
              String(conversationId),
            );
          if (transcriptData && transcriptData.transcript) {
            const callerNameForTranscript =
              createdCallHistory.callerName || 'Caller';
            formattedTranscriptForEmail = this.formatTranscriptForEmail(
              transcriptData.transcript,
              callerNameForTranscript,
            );
          }
        } catch (transcriptError: any) {
          this.logger.warn(
            `[EMAIL] ⚠️ Could not fetch transcript for email: ${transcriptError.message}`,
          );
        }

        try {
          const emailResult = await this.emailService.sendEscalationEmail({
            callerName: createdCallHistory.callerName || 'Unknown',
            callerEmail: createdCallHistory.callerEmail || 'Not provided',
            callerPhone:
              callerNumber || createdCallHistory.callerNumber || 'Not provided',
            callbackNumber:
              callbackNumber ||
              callerNumber ||
              createdCallHistory.callerNumber ||
              'Not provided',
            dealerCode: createdCallHistory.facility || undefined,
            callSummary: createdCallHistory.callSummary || undefined,
            callTranscript: formattedTranscriptForEmail,
            siteInfo: siteInfoForEmail || undefined,
          });

          if (!emailResult.success) {
            this.logger.error(
              `[EMAIL] ❌ Failed to send escalation email from webhook: ${emailResult.error}`,
            );
          }
        } catch (emailError: any) {
          this.logger.error(
            `[EMAIL] ❌ Error sending escalation email from webhook: ${emailError.message}`,
          );
        }
      }

      try {
        this.logger.log(
          `[AFTER_HOURS_HUMAN_CALL] triggering runForConversation from post-call webhook | conversation_id="${conversationId}"`,
        );
        const humanCallResult =
          await this.afterHoursPendingHumanCallService.runForConversation(
            String(conversationId),
          );
        this.logger.log(
          `[AFTER_HOURS_HUMAN_CALL] outcome for conversation_id="${conversationId}" → ${JSON.stringify(humanCallResult)}`,
        );

        // SAFETY NET — an after-hours caller whose request was never recorded.
        //
        // The agent is supposed to call get_user_detail once the callback number
        // is confirmed; that tool is the ONLY thing that creates the pending row
        // this escalation reads. When the agent skips it — which it has done in
        // production — the row is absent, no technician is ever called, and the
        // caller hangs up believing help is on the way. Nothing else notices.
        //
        // The prompt has been hardened against that jump, but a prompt is a
        // request, not a guarantee: this is a nurse-call fault report, so a
        // second, code-level path has to exist. Email the team with everything
        // the webhook already holds, so the request reaches a human even when
        // the automated escalation could not run.
        if (
          humanCallResult.outcome === 'skipped' &&
          humanCallResult.reason === 'no_pending_transfer_query' &&
          // 'Yes' / 'No', not a boolean — a bare truthiness check would also
          // fire on 'No' and email the team about every business-hours call.
          finalAfterHours === 'Yes' &&
          // The callback branch above already emailed the team for this call;
          // sending again would double up on the same request.
          !shouldSendCallbackEmail
        ) {
          this.logger.error(
            `[AFTER_HOURS_HUMAN_CALL] ⚠️ after-hours call with NO pending row — the agent never called get_user_detail. conversation_id="${conversationId}" caller="${createdCallHistory.callerName}". Sending fallback escalation email so the request is not lost.`,
          );

          try {
            // Fetched here rather than reused: the transcript above is built
            // only inside the callback-email branch, which did not run for this
            // conversation.
            let fallbackTranscript: string | undefined;
            try {
              const transcriptData =
                await this.callTranscriptService.findByConversationId(
                  String(conversationId),
                );
              if (transcriptData?.transcript) {
                fallbackTranscript = this.formatTranscriptForEmail(
                  transcriptData.transcript,
                  createdCallHistory.callerName || 'Caller',
                );
              }
            } catch {
              // A missing transcript must never stop the email — the caller's
              // details matter far more than the wording of the call.
            }

            const fallback = await this.emailService.sendEscalationEmail({
              callerName: createdCallHistory.callerName || 'Not provided',
              callerEmail: createdCallHistory.callerEmail || 'Not provided',
              callerPhone:
                callerNumber ||
                createdCallHistory.callerNumber ||
                'Not provided',
              callbackNumber:
                callbackNumber ||
                callerNumber ||
                createdCallHistory.callerNumber ||
                'Not provided',
              dealerCode: createdCallHistory.facility || undefined,
              callSummary: createdCallHistory.callSummary || undefined,
              callTranscript: fallbackTranscript,
              siteInfo: siteInfoForEmail || undefined,
            });

            this.logger.log(
              `[AFTER_HOURS_HUMAN_CALL] fallback escalation email sent=${fallback.success} for conversation_id="${conversationId}"`,
            );
          } catch (fallbackErr: unknown) {
            const fm =
              fallbackErr instanceof Error
                ? fallbackErr.message
                : String(fallbackErr);
            this.logger.error(
              `[AFTER_HOURS_HUMAN_CALL] fallback escalation email FAILED for conversation_id="${conversationId}": ${fm}`,
            );
          }
        }
      } catch (humanCallErr: unknown) {
        const m =
          humanCallErr instanceof Error
            ? humanCallErr.message
            : String(humanCallErr);
        const stack =
          humanCallErr instanceof Error ? humanCallErr.stack : undefined;
        this.logger.error(
          `[AFTER_HOURS_HUMAN_CALL] threw for conversation_id="${conversationId}": ${m}`,
          stack,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error processing ElevenLabs webhook: ${error.message}`,
      );
      throw error;
    }
  }

  // Helper method to format transcript for email readability
  private formatTranscriptForEmail(
    transcript: any[],
    callerName: string = 'Caller',
  ): string {
    if (!transcript || !Array.isArray(transcript)) {
      return '';
    }

    return transcript
      .map((item) => {
        const role = item.role === 'agent' ? 'AI Agent' : callerName;
        const time = item.timeInCallSecs || '';
        const message = item.message || '';
        return `[${time}] ${role}: ${message}`;
      })
      .join('\n\n');
  }

  /**
   * Get dealer with agents by dealer code
   * @param dealerCode - The dealer code
   * @returns Dealer information with prioritized agents
   */
  async getDealerWithAgentsByCode(
    dealerCode: string,
  ): Promise<IWebhookDealerWithAgents> {
    if (!dealerCode || dealerCode.trim() === '') {
      throw new BadRequestException('Dealer code is required');
    }

    try {
      // Optimized query: filter at database level and only select needed fields
      const dealer = await this.dealerRepository
        .createQueryBuilder('dealer')
        .select(['dealer.dealerName', 'dealer.email', 'dealer.phone'])
        .leftJoinAndSelect(
          'dealer.humanAgents',
          'agent',
          'agent.isActive = :isActive AND agent.isAvailable = :isAvailable',
          { isActive: true, isAvailable: true },
        )
        .addSelect([
          'agent.id',
          'agent.agentName',
          'agent.phone',
          'agent.email',
          'agent.priority',
        ])
        .where('dealer.dealerCode = :dealerCode', { dealerCode })
        .getOne();

      if (!dealer) {
        throw new NotFoundException(`Dealer with code ${dealerCode} not found`);
      }

      // Map and sort agents by priority (already filtered at DB level)
      // Phone numbers already have +91 from database-
      const sortedAgents = (dealer.humanAgents || [])
        .map((agent) => ({
          id: agent.id,
          name: agent.agentName,
          contactNumber: agent.phone || '',
          email: agent.email,
          priority: agent.priority as 'P1' | 'P2' | 'P3' | 'P4' | 'P5',
        }))
        .sort((a, b) => a.priority.localeCompare(b.priority));

      // Build agents array with priorityIndex
      const agents = sortedAgents.map((agent, index) => ({
        id: agent.id,
        name: agent.name,
        contactNumber: agent.contactNumber,
        email: agent.email,
        priority: agent.priority,
        priorityIndex: index,
      }));

      // Build response
      // Phone numbers already have +91 from database
      const response: IWebhookDealerWithAgents = {
        success: true,
        dealerName: dealer.dealerName,
        dealerEmail: dealer.email,
        dealerPhone: dealer.phone || '',
        totalAgents: agents.length,
        agents,
      };

      return response;
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to retrieve dealer with agents: ${error.message || 'Unknown error occurred'}`,
      );
    }
  }

  /**
   * Transfer call to agent using Twilio
   * Delegates to CallTransferService
   * @param transferRequest - Transfer request data
   * @returns Transfer result
   */
  async transferCall(transferRequest: TransferRequestDto): Promise<{
    success: boolean;
    message: string;
    connectedAgent?: string;
    attemptedAgents?: number;
  }> {
    return await this.callTransferService.transferCall(transferRequest);
  }
}
