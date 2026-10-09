import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HumanAgent } from '@/schema';
import { TransferRequestDto } from '@/webhooks/dto';
import { CallHistoryService } from '@/callHistory/callHistoryService';
import { CallTranscriptService } from '@/callTranscript/callTranscriptService';
import { CreateCallHistoryDto } from '@/callHistory/dto';
import { EmailService } from '@/helper/email-service';
import { TTSService } from '@/helper/tts-service';

const twilio = require('twilio');

type AgentAnswerResult =
  | 'answered'
  | 'caller_left'
  | 'no-answer'
  | 'busy'
  | 'failed'
  | 'machine'
  | 'canceled';

@Injectable()
export class CallTransferService {
  private readonly logger = new Logger(CallTransferService.name);
  private readonly countryCode: string;
  private readonly countryCodeNumber: string;
  private readonly localDigits: number;
  private readonly publicApiBaseUrl: string | null = null;
  /** When caller hangs up during ring, we hang up the agent leg. Map conference name -> agent call SID. */
  private readonly conferenceToAdvisorCallSid = new Map<string, string>();

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(HumanAgent)
    private readonly humanAgentRepository: Repository<HumanAgent>,
    private readonly callHistoryService: CallHistoryService,
    private readonly callTranscriptService: CallTranscriptService,
    private readonly emailService: EmailService,
    private readonly ttsService: TTSService,
  ) {
    // Get country code from environment variable (default: +61 for Australia)
    // For testing in India, set COUNTRY_CODE=+91 in .env file
    this.countryCode = this.configService.get<string>('COUNTRY_CODE') || '+61';
    // Extract numeric part (e.g., '61' from '+61' or '91' from '+91')
    this.countryCodeNumber = this.countryCode.replace(/^\+/, '');
    this.localDigits = this.countryCodeNumber === '91' ? 10 : 9;

    // Base URL used for Twilio webhooks (must be publicly reachable by Twilio)
    // Prefer PUBLIC_API_URL, fallback to BASE_URL if present
    const publicApiUrl = this.configService.get<string>('PUBLIC_API_URL') || this.configService.get<string>('BASE_URL');
    if (publicApiUrl) {
      const base = publicApiUrl.replace(/\/+$/, '');
      this.publicApiBaseUrl = base.endsWith('/api') ? base : `${base}/api`;
    } else {
      this.publicApiBaseUrl = null;
      this.logger.warn('No PUBLIC_API_URL or BASE_URL configured; Twilio agent AMD webhooks will be disabled and inline TwiML will be used instead.');
    }
  }

  async transferCall(transferRequest: TransferRequestDto): Promise<{
    success: boolean;
    message: string;
    connectedAgent?: string;
    attemptedAgents?: number;
  }> {

    try {
      const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
      const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
      const twilioPhoneNumber = this.configService.get<string>('TWILIO_PHONE_NUMBER');

      if (!accountSid || !authToken || !twilioPhoneNumber) {
        this.logger.error('[ERROR] Missing Twilio credentials');
        return {
          success: false,
          message: 'Server misconfiguration: missing Twilio credentials'
        };
      }

      if (!transferRequest.transfer_phone_number) {
        this.logger.error('[ERROR] Missing transfer_phone_number in request');
        return {
          success: false,
          message: 'No valid transfer destination provided'
        };
      }
      const client = twilio(accountSid, authToken);
      // Verify current call exists
      try {
        const currentCall = await client.calls(transferRequest.current_call_sid).fetch();

        if (currentCall.status === 'completed' || currentCall.status === 'failed') {
          this.logger.error(`[ERROR] Call ${transferRequest.current_call_sid} is already ${currentCall.status}`);
          return {
            success: false,
            message: 'The call has already ended'
          };
        }
      } catch (error: any) {
        this.logger.error(`[ERROR] Failed to fetch call: ${error.message}`);
        this.logger.error(`[ERROR] Full error: ${JSON.stringify(error)}`);
        return {
          success: false,
          message: 'Invalid call reference'
        };
      }

      // Get agent queue or create from primary number
      let agentQueue;

      // Check if agent_queue is a string and parse it
      if (typeof transferRequest.agent_queue === 'string') {
        try {
          agentQueue = JSON.parse(transferRequest.agent_queue);
        } catch (parseError) {
          agentQueue = [{ contactNumber: transferRequest.transfer_phone_number, priority: 1 }];
        }
      } else if (Array.isArray(transferRequest.agent_queue) && transferRequest.agent_queue.length > 0) {
        agentQueue = transferRequest.agent_queue;
      } else {
        agentQueue = [{ contactNumber: transferRequest.transfer_phone_number, priority: 1 }];
      }

      // If queue is empty (e.g. agent_queue was "[]"), use transfer_phone_number as single agent
      if (!agentQueue || agentQueue.length === 0) {
        agentQueue = [{ contactNumber: transferRequest.transfer_phone_number, priority: 1 }];
      }

      // Sort by priority (priorityIndex or priority field)
      agentQueue = agentQueue.sort((a, b) => {
        const priorityA = a.priorityIndex ?? (parseInt(a.priority?.toString().replace('P', '')) || 999);
        const priorityB = b.priorityIndex ?? (parseInt(b.priority?.toString().replace('P', '')) || 999);
        return priorityA - priorityB;
      });

      const retryTimeout = 20;
      const maxAttemptsPerAgent = 3;
      let attemptedAgents = 0;
      let agentPickedUp = false;
      let pickedUpAgentName: string | null = null;

      // Create initial call history record if conversation_id is provided
      if (transferRequest.conversation_id) {
        try {
          await this.callHistoryService.createOrUpdateByConversationId(
            transferRequest.conversation_id,
            {
              conversationId: transferRequest.conversation_id,
              callDateTime: new Date().toISOString(),
            }
          );
        } catch (error: any) {
          this.logger.error(`Failed to create initial call history: ${error.message}`);
        }
      }

      const tail = transferRequest.current_call_sid.length >= 8
        ? transferRequest.current_call_sid.slice(-8)
        : transferRequest.current_call_sid;

      // Try each agent in queue
      for (const agent of agentQueue) {
        const destinationNumber = this.normalizeTransferPhoneNumber(agent.contactNumber);
        const phoneRegex = new RegExp(`^\\${this.countryCode}\\d{${this.localDigits}}$`);
        if (!phoneRegex.test(destinationNumber)) {
          this.logger.error(`[ERROR] Invalid phone number format: ${destinationNumber} (original: ${agent.contactNumber}), trying next agent`);
          continue;
        }

        for (let attempt = 1; attempt <= maxAttemptsPerAgent; attempt++) {
          attemptedAgents++;
          const conferenceName = `transfer_${tail}_${Date.now()}_${attempt}`;

          // When caller hangs up, conference ends; statusCallback lets us hang up the still-ringing agent leg
          // publicApiBaseUrl already includes /api so Twilio hits POST /api/webhooks/twilio/conference-ended
          const statusCallbackAttrs = this.publicApiBaseUrl
            ? ` statusCallback="${this.publicApiBaseUrl}/webhooks/twilio/conference-ended" statusCallbackEvent="end" statusCallbackMethod="POST"`
            : '';

          // Create TwiML for current call to join conference
          const callerTwiML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference endConferenceOnExit="true" waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical"${statusCallbackAttrs}>${conferenceName}</Conference>
  </Dial>
</Response>`;
          try {
            await client.calls(transferRequest.current_call_sid).update({
              twiml: callerTwiML
            });
          } catch (updateError: any) {
            this.logger.error(`[ERROR] Failed to update current call to conference: ${updateError.message}`);
            this.logger.error(`[ERROR] Full error: ${JSON.stringify(updateError)}`);
            throw updateError;
          }

          // Prepare advisor leg: by default, use inline TwiML (no AMD) as a safe fallback.
          // When a public API base URL is configured, prefer webhook-based AMD flow that
          // dials the agent number first with machineDetection, then joins conference
          // only if Twilio reports AnsweredBy=human.
          let advisorCall;
          try {
            if (this.publicApiBaseUrl) {
              const advisorUrl = `${this.publicApiBaseUrl}/webhooks/twilio/agent-dial` +
                `?conference=${encodeURIComponent(conferenceName)}` +
                `&to=${encodeURIComponent(destinationNumber)}`;

              advisorCall = await client.calls.create({
                to: destinationNumber,
                from: twilioPhoneNumber,
                url: advisorUrl,
                method: 'GET',
                timeout: retryTimeout,
                timeLimit: 14400,
              });
            } else {
              // Fallback: inline TwiML without AMD (no Say — agent goes straight to conference/hold)
              const advisorTwiML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnMedia="false">
    <Conference endConferenceOnExit="true" beep="false" waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical">${conferenceName}</Conference>
  </Dial>
</Response>`;

              advisorCall = await client.calls.create({
                to: destinationNumber,
                from: twilioPhoneNumber,
                twiml: advisorTwiML,
                timeout: retryTimeout,
                timeLimit: 14400,
              });
            }

            this.conferenceToAdvisorCallSid.set(conferenceName, advisorCall.sid);
          } catch (callError: any) {
            this.logger.error(`[ERROR] Failed to create advisor call on attempt ${attempt} for ${destinationNumber}: ${callError.message}`);
            continue;
          }

          const answerResult = await this.waitForAgentAnswer(
            client,
            advisorCall.sid,
            retryTimeout,
            transferRequest.current_call_sid,
          );
          if (answerResult === 'caller_left') {
            // Caller hung up during ring — hang up the agent so their phone stops ringing
            this.conferenceToAdvisorCallSid.delete(conferenceName);
            try {
              await client.calls(advisorCall.sid).update({ status: 'completed' });
            } catch (err: any) {
              this.logger.warn(`[Twilio] Failed to hang up agent ${advisorCall.sid}: ${err?.message}`);
            }
            return {
              success: false,
              message: 'Call ended',
            };
          }
          if (answerResult === 'answered') {
            this.conferenceToAdvisorCallSid.delete(conferenceName);
            agentPickedUp = true;
            pickedUpAgentName = agent.name || destinationNumber;

            try {
              const normalizedAgentPhone = destinationNumber.replace(/[\s()-]/g, '').replace(new RegExp(`^\\${this.countryCode}`), '');
              const humanAgent = await this.humanAgentRepository.findOne({
                where: { phone: normalizedAgentPhone },
                relations: ['supportType', 'dealer']
              });

              let foundAgent: HumanAgent | null = null;

              if (humanAgent) {
                foundAgent = humanAgent;
              } else if (agent.name) {
                // Fallback: try to find by agent name
                const humanAgentByName = await this.humanAgentRepository.findOne({
                  where: { agentName: agent.name },
                  relations: ['supportType', 'dealer']
                });

                if (humanAgentByName) {
                  foundAgent = humanAgentByName;
                }
              }

              // Update call history with agent data.
              // afterHours is intentionally NOT touched here — it is set exclusively by
              // the post-call webhook based on the get_working_hours_information tool's
              // currentMode (afterHours -> 'Yes', businessHours -> 'No').
              if (transferRequest.conversation_id) {
                const updateData: Partial<CreateCallHistoryDto> = {
                  humanAgentName: pickedUpAgentName || undefined,
                  handledBy: pickedUpAgentName || undefined,
                  isTransferred: true,
                  isEscalation: 'successful' as const,
                  callStatus: 'answered',
                };

                await this.callHistoryService.createOrUpdateByConversationId(
                  transferRequest.conversation_id,
                  updateData
                );
              }
            } catch (error: any) {
              this.logger.error(`Error extracting/updating agent details: ${error.message}`);
              this.logger.error(error.stack);
            }

            return {
              success: true,
              message: 'Connecting you to the agent now. Please hold.',
              connectedAgent: pickedUpAgentName || undefined,
              attemptedAgents
            };
          }

          this.conferenceToAdvisorCallSid.delete(conferenceName);
          try {
            await client.calls(advisorCall.sid).update({ status: 'completed' });
          } catch (cancelError: any) {
            this.logger.error(`Failed to cancel call ${advisorCall.sid}: ${cancelError.message}`);
          }

        }

        if (agentPickedUp) {
          break;
        }
      }

      if (transferRequest.conversation_id && !agentPickedUp) {
        this.logger.log(
          `[TRANSFER_NO_PICKUP] conversationId=${transferRequest.conversation_id} attemptedAgents=${attemptedAgents} result=no-agent-picked`,
        );
        try {
          await this.callHistoryService.createOrUpdateByConversationId(transferRequest.conversation_id, {
            isEscalation: 'unsuccessful',
            isTransferred: false,
            humanAgentName: undefined,
            callStatus: 'not-answered',
          });
        } catch (error: any) {
          this.logger.error(
            `[ESCALATION] ❌ Error updating call history with escalation: ${error.message}`,
          );
        }
      }

      const disconnectMessage = 'We apologize, but all our agents are currently unavailable. We will raise a callback request for you and someone will call you back shortly. Thank you for your patience.';

      await this.disconnectCallWithMessage(
        client,
        transferRequest.current_call_sid,
        disconnectMessage
      );

      if (transferRequest.conversation_id) {
        await this.sendTransferFailedCallbackEmail(transferRequest.conversation_id);
      }

      return {
        success: false,
        message: 'All agents unavailable. Callback request raised.',
        attemptedAgents
      };

    } catch (error: any) {

      let errorMessage = 'Unable to connect to agent at this time. Someone will call you back shortly.';

      if (error.code === 21217) {
        errorMessage = 'The agent phone number is not available. We will call you back.';
        this.logger.error('[ERROR] Twilio error 21217: Phone number not available');
      } else if (error.code === 21401) {
        errorMessage = 'Invalid phone number. Please verify the agent contact details.';
        this.logger.error('[ERROR] Twilio error 21401: Invalid phone number');
      } else if (error.status === 400) {
        errorMessage = 'Invalid request. Please check the call details.';
        this.logger.error('[ERROR] HTTP 400: Bad request');
      }

      return {
        success: false,
        message: errorMessage
      };
    }
  }

  // Helper method to wait for agent answer with AMD (Answering Machine Detection)
  // If callerCallSid is provided, we also check each poll whether the caller hung up; if so we return 'caller_left'.
  private async waitForAgentAnswer(
    client: any,
    callSid: string,
    timeoutSeconds: number,
    callerCallSid?: string,
  ): Promise<AgentAnswerResult> {
    const startTime = Date.now();
    const checkInterval = 500; // Check every 0.5 seconds for faster detection
    let checkCount = 0;
    const amdMinWaitTime = 4; // Minimum wait time for AMD to complete (increased from 3)
    /** Align with Twilio `machineDetectionTimeout` (12s) + buffer for REST `answeredBy` */
    const amdMaxWaitTime = 14;
    let lastAnsweredBy: string | null = null;
    let consecutiveMachineDetections = 0;
    const requiredMachineDetections = 2; // Require 2 consecutive machine detections to be sure


    while ((Date.now() - startTime) / 1000 < timeoutSeconds) {
      checkCount++;
      try {
        // If caller's call SID provided, check whether caller hung up (so we can stop ringing the agent)
        if (callerCallSid) {
          try {
            const callerCall = await client.calls(callerCallSid).fetch();
            if (['completed', 'failed', 'canceled'].includes(callerCall.status)) {
              return 'caller_left';
            }
          } catch (callerErr: any) {
          }
        }

        const call = await client.calls(callSid).fetch();
        const ab =
          typeof call.answeredBy === 'string'
            ? call.answeredBy.trim().toLowerCase()
            : call.answeredBy
              ? String(call.answeredBy).trim().toLowerCase()
              : null;

        // Track answeredBy changes
        if (ab && ab !== lastAnsweredBy) {
          lastAnsweredBy = ab;
        }

        // Check if call is in-progress
        if (call.status === 'in-progress') {
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          
          // Wait minimum time for AMD to complete
          if (elapsedSeconds < amdMinWaitTime) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            continue;
          }

          // Check AMD result if available
          if (ab) {
            if (ab === 'human') {
              // Double-check: if we previously detected machine, wait a bit more
              if (consecutiveMachineDetections > 0 && elapsedSeconds < amdMaxWaitTime) {
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                continue;
              }
              consecutiveMachineDetections = 0;
              return 'answered';
            }
            const confirmedMachine =
              ab === 'machine' ||
              ab === 'machine_start' ||
              ab === 'machine_end_beep' ||
              ab === 'machine_end_silence' ||
              ab === 'machine_end_other' ||
              ab === 'fax';
            if (confirmedMachine) {
              consecutiveMachineDetections++;

              // Wait for confirmation if we haven't reached required detections
              if (consecutiveMachineDetections < requiredMachineDetections && elapsedSeconds < amdMaxWaitTime) {
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                continue;
              }

              // Confirmed machine/voicemail after multiple detections
              // Cancel the call since it's voicemail/machine
              try {
                await client.calls(callSid).update({ status: 'completed' });
              } catch (cancelError: any) {
                this.logger.error(`Failed to cancel voicemail call: ${cancelError.message}`);
              }
              return 'machine';
            }
            // unknown / carrier-specific values — silent human, treat as live and bridge.
            // Voicemail systems always play a prompt within the silence window and would have
            // produced a machine_* classification by now, so silence here is probably human.
            consecutiveMachineDetections = 0;
            return 'answered';
          }
          // No AMD classification yet; keep polling until ring timeout — never assume human.
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          continue;
        }

        if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(call.status)) {
          if (ab === 'machine' || ab === 'fax') {
            return 'machine';
          }
          if (call.status === 'busy') {
            return 'busy';
          }
          if (call.status === 'failed') {
            return 'failed';
          }
          if (call.status === 'canceled') {
            return 'canceled';
          }
          return 'no-answer';
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      } catch (error: any) {
        this.logger.error(`[ERROR] Error checking call status: ${error.message}`);
        return 'failed';
      }
    }

    return 'no-answer';
  }

  private async sendTransferFailedCallbackEmail(conversationId: string): Promise<void> {
    try {
      const callHistory = await this.callHistoryService.findByConversationId(conversationId);
      if (!callHistory) {
        this.logger.warn(`[EMAIL] Skipping transfer-failed callback email, call history missing for ${conversationId}`);
        return;
      }

      let formattedTranscriptForEmail: string | undefined;
      try {
        const transcriptData = await this.callTranscriptService.findByConversationId(conversationId);
        if (transcriptData?.transcript) {
          formattedTranscriptForEmail = this.formatTranscriptForEmail(
            transcriptData.transcript,
            callHistory.callerName || 'Caller',
          );
        }
      } catch (transcriptError: any) {
        this.logger.warn(`[EMAIL] Could not fetch transcript for transfer-failed callback email: ${transcriptError.message}`);
      }

      const emailResult = await this.emailService.sendEscalationEmail({
        callerName: callHistory.callerName || 'Unknown',
        callerEmail: callHistory.callerEmail || 'Not provided',
        callerPhone: callHistory.callerNumber || 'Not provided',
        callbackNumber: callHistory.callerNumber || 'Not provided',
        dealerCode: callHistory.facility || undefined,
        callSummary: callHistory.callSummary || undefined,
        callTranscript: formattedTranscriptForEmail,
      });

      if (!emailResult.success) {
        this.logger.error(`[EMAIL] Failed to send transfer-failed callback email for ${conversationId}: ${emailResult.error}`);
      }
    } catch (error: any) {
      this.logger.error(`[EMAIL] Error sending transfer-failed callback email for ${conversationId}: ${error.message}`);
    }
  }

  private formatTranscriptForEmail(transcript: any[], callerName: string = 'Caller'): string {
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

  private normalizeTransferPhoneNumber(phone: string): string {
    const rawPhone = phone?.trim() || '';
    const digitsOnly = rawPhone.replace(/\D/g, '');

    if (!digitsOnly) {
      return '';
    }

    if (
      digitsOnly.startsWith(this.countryCodeNumber) &&
      digitsOnly.length === this.countryCodeNumber.length + this.localDigits
    ) {
      return `+${digitsOnly}`;
    }

    if (digitsOnly.length === this.localDigits + 1 && digitsOnly.startsWith('0')) {
      return this.countryCode + digitsOnly.slice(1);
    }

    if (digitsOnly.length === this.localDigits) {
      return this.countryCode + digitsOnly;
    }

    return rawPhone.replace(/[\s()-]/g, '');
  }

  // Helper method to disconnect call with message
  private async disconnectCallWithMessage(client: any, callSid: string, message: string): Promise<void> {
    try {
      let disconnectTwiML: string;

      // Try to get TTS audio URL
      try {
        const audioUrl = await this.ttsService.generateAndStoreAudio(message);
        
        // Escape the URL for XML
        const escapedUrl = audioUrl
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');

        disconnectTwiML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${escapedUrl}</Play>
  <Hangup/>
</Response>`;
      } catch (ttsError: any) {
        // Fallback to Say verb if TTS fails
        this.logger.warn(`TTS generation failed, falling back to Say verb: ${ttsError.message}`);
        
        const escapedMessage = message
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');

        disconnectTwiML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapedMessage}</Say>
  <Hangup/>
</Response>`;
      }

      await client.calls(callSid).update({
        twiml: disconnectTwiML
      });
    } catch (error: any) {
      this.logger.error(`Failed to disconnect call: ${error.message}`);
    }
  }

  /**
   * When the conference ends (e.g. caller hung up during ring), hang up the agent leg so they stop ringing.
   * Called from the Twilio conference statusCallback webhook.
   * Uses in-memory map first; if missing (e.g. different instance), tries Twilio API to list participants and hang up the non-caller leg.
   */
  async hangUpAgentForConference(
    conferenceFriendlyName: string,
    callbackBody?: { ConferenceSid?: string; CallSidEndingConference?: string },
  ): Promise<void> {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) return;

    let advisorCallSid = this.conferenceToAdvisorCallSid.get(conferenceFriendlyName);
    this.conferenceToAdvisorCallSid.delete(conferenceFriendlyName);

    if (!advisorCallSid && callbackBody?.ConferenceSid && callbackBody?.CallSidEndingConference) {
      try {
        const client = twilio(accountSid, authToken);
        const participants = await client.conferences(callbackBody.ConferenceSid).participants.list();
        const callerSid = callbackBody.CallSidEndingConference;
        const agentParticipant = participants.find((p: any) => p.callSid !== callerSid);
        if (agentParticipant?.callSid) {
          advisorCallSid = agentParticipant.callSid;
        }
      } catch (listErr: any) {
        this.logger.warn(`[Twilio] Could not list conference participants for ${conferenceFriendlyName}: ${listErr?.message}`);
      }
    }

    if (!advisorCallSid) {
      this.logger.warn(`[Twilio] No agent call SID for conference ${conferenceFriendlyName} (map empty and API fallback failed or not available)`);
      return;
    }

    try {
      const client = twilio(accountSid, authToken);
      await client.calls(advisorCallSid).update({ status: 'completed' });
    } catch (err: any) {
      this.logger.warn(`[Twilio] Failed to hang up agent ${advisorCallSid}: ${err?.message}`);
    }
  }

}
