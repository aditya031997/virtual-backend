import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CallHistory } from '@/schema/callHistory';
import { CallHistoryService } from '@/callHistory/callHistoryService';
import { CallHistoryController } from '@/callHistory/callHistoryController';
import { CallTranscriptModule } from '@/callTranscript/callTranscriptModule';

@Module({
  imports: [
    TypeOrmModule.forFeature([CallHistory]),
    CallTranscriptModule,
  ],
  controllers: [CallHistoryController],
  providers: [CallHistoryService],
  exports: [CallHistoryService],
})
export class CallHistoryModule {}

