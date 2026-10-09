import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CallTranscript } from '@/schema/callTranscript';
import { CallTranscriptService } from '@/callTranscript/callTranscriptService';
import { CallTranscriptController } from '@/callTranscript/callTranscriptController';

@Module({
  imports: [
    TypeOrmModule.forFeature([CallTranscript]),
    ConfigModule,
  ],
  controllers: [CallTranscriptController],
  providers: [CallTranscriptService],
  exports: [CallTranscriptService],
})
export class CallTranscriptModule {}

