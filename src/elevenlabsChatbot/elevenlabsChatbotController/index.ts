import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ElevenLabsChatbotService } from '@/elevenlabsChatbot/elevenlabsChatbotService';

@Controller('elevenlabs/chatbot')
export class ElevenLabsChatbotController {
  constructor(
    private readonly elevenLabsChatbotService: ElevenLabsChatbotService,
  ) {}

  @Get('signed-url')
  @ApiOperation({ summary: 'Get a signed URL for the chatbot agent' })
  @ApiResponse({
    status: 200,
    description: 'Signed URL generated successfully',
  })
  async getSignedUrl(): Promise<{ signedUrl: string }> {
    return this.elevenLabsChatbotService.getSignedUrl();
  }
}
