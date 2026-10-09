import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

@Injectable()
export class ElevenLabsChatbotService {
  private readonly logger = new Logger(ElevenLabsChatbotService.name);
  private readonly elevenLabsClient: ElevenLabsClient;
  private readonly chatbotAgentId: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('ELEVENLABS_API_KEY');
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    const chatbotAgentId = this.configService.get<string>(
      'ELEVENLABS_CHATBOT_AGENT_ID',
    );
    if (!chatbotAgentId) {
      throw new Error('ELEVENLABS_CHATBOT_AGENT_ID is not configured');
    }

    this.chatbotAgentId = chatbotAgentId;
    this.elevenLabsClient = new ElevenLabsClient({
      environment: 'https://api.elevenlabs.io',
      apiKey,
    });
  }

  async getSignedUrl(): Promise<{ signedUrl: string }> {
    try {
      const response =
        await this.elevenLabsClient.conversationalAi.conversations.getSignedUrl(
          {
            agentId: this.chatbotAgentId,
          },
        );

      return {
        signedUrl: response.signedUrl,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to generate signed URL for chatbot agent: ${error.message}`,
        error.stack,
      );

      throw new InternalServerErrorException(
        'Failed to generate ElevenLabs chatbot signed URL',
      );
    }
  }
}
