import { Module } from '@nestjs/common';
import { ElevenLabsChatbotController } from '@/elevenlabsChatbot/elevenlabsChatbotController';
import { ElevenLabsChatbotService } from '@/elevenlabsChatbot/elevenlabsChatbotService';

@Module({
  controllers: [ElevenLabsChatbotController],
  providers: [ElevenLabsChatbotService],
  exports: [ElevenLabsChatbotService],
})
export class ElevenLabsChatbotModule {}
