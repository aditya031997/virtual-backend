import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ElevenLabsOutboundResult {
  apiSuccess: boolean;
  /** v1: ElevenLabs returns success:true when the outbound request succeeds; refine if API adds explicit pickup. */
  treatedAsPickedUp: boolean;
  statusCode: number;
  body: unknown;
}

export interface ElevenLabsOutboundOptions {
  dynamicVariables?: Record<string, string | number | boolean>;
}

@Injectable()
export class ElevenLabsOutboundHelper {
  private readonly logger = new Logger(ElevenLabsOutboundHelper.name);

  constructor(private readonly configService: ConfigService) {}

  async placeOutboundCall(
    toNumberE164: string,
    options: ElevenLabsOutboundOptions = {},
  ): Promise<ElevenLabsOutboundResult> {
    const apiKey = this.configService.get<string>('ELEVENLABS_API_KEY');
    const agentId = this.configService.get<string>('SMART_CALLER_AGENT');
    const agentPhoneNumberId = this.configService.get<string>('AGENT_PHONENO_ID');

    if (!apiKey?.trim() || !agentId?.trim() || !agentPhoneNumberId?.trim()) {
      this.logger.error(
        'ElevenLabs outbound: missing ELEVENLABS_API_KEY, SMART_CALLER_AGENT, or AGENT_PHONENO_ID',
      );
      return {
        apiSuccess: false,
        treatedAsPickedUp: false,
        statusCode: 0,
        body: { message: 'Missing ElevenLabs outbound configuration' },
      };
    }

    const url = 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call';
    let statusCode = 0;
    let body: unknown = null;

    const requestBody: Record<string, unknown> = {
      agent_id: agentId,
      agent_phone_number_id: agentPhoneNumberId,
      to_number: toNumberE164,
    };

    const dyn = options.dynamicVariables;
    if (dyn && Object.keys(dyn).length > 0) {
      requestBody.conversation_initiation_client_data = {
        dynamic_variables: dyn,
      };
    }

    this.logger.log(
      `[ELEVENLABS_OUTBOUND] POST ${url} to_number=${toNumberE164} agent_id=${agentId} agent_phone_number_id=${agentPhoneNumberId} dynamicVarsKeys=[${Object.keys(dyn || {}).join(',')}]`,
    );

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      statusCode = res.status;
      try {
        body = await res.json();
      } catch {
        body = { message: await res.text() };
      }

      const b = body as Record<string, unknown> | null;
      const successFlag = Boolean(b && typeof b === 'object' && b.success === true);
      const apiSuccess = res.ok && successFlag;
      const treatedAsPickedUp = apiSuccess;

      if (apiSuccess) {
        this.logger.log(
          `[ELEVENLABS_OUTBOUND] ✅ accepted to_number=${toNumberE164} HTTP=${statusCode} body=${JSON.stringify(body)}`,
        );
      } else {
        this.logger.warn(
          `[ELEVENLABS_OUTBOUND] ❌ failed to_number=${toNumberE164} HTTP=${statusCode} resOk=${res.ok} successFlag=${successFlag} body=${JSON.stringify(body)}`,
        );
      }

      return {
        apiSuccess,
        treatedAsPickedUp,
        statusCode,
        body,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `[ELEVENLABS_OUTBOUND] 💥 fetch threw for to_number=${toNumberE164}: ${msg}`,
        stack,
      );
      return {
        apiSuccess: false,
        treatedAsPickedUp: false,
        statusCode,
        body: { message: msg },
      };
    }
  }
}
