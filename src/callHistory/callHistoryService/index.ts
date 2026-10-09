import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallHistory } from '@/schema/callHistory';
import { CreateCallHistoryDto } from '@/callHistory/dto';
import { ICallHistoryResponse } from '@/types/callHistory';
import { CallTranscriptService } from '@/callTranscript/callTranscriptService';

@Injectable()
export class CallHistoryService {
  private readonly logger = new Logger(CallHistoryService.name);

  constructor(
    @InjectRepository(CallHistory)
    private readonly callHistoryRepository: Repository<CallHistory>,
    private readonly callTranscriptService: CallTranscriptService,
  ) {}

  async create(createCallHistoryDto: CreateCallHistoryDto): Promise<ICallHistoryResponse> {
    const callHistory = this.callHistoryRepository.create({
      ...createCallHistoryDto,
      callDateTime: new Date(createCallHistoryDto.callDateTime),
      callerName: createCallHistoryDto.callerName ?? null,
      phoneNumber: createCallHistoryDto.phoneNumber ?? null,
      feedback: createCallHistoryDto.feedback || 'Neutral',
      isTransferred: createCallHistoryDto.isTransferred ?? false,
      humanAgentName: createCallHistoryDto.humanAgentName ?? null,
      callerNumber: createCallHistoryDto.callerNumber ?? null,
      callerEmail: createCallHistoryDto.callerEmail ?? null,
      // Normalize isEscalation to ensure it's always an enum value
      isEscalation: this.normalizeIsEscalation(createCallHistoryDto.isEscalation ?? 'not-requested'),
      callSummary: createCallHistoryDto.callSummary ?? null,
    });

    const saved = await this.callHistoryRepository.save(callHistory);
    return this.mapToResponse(saved);
  }

  async findAll(): Promise<ICallHistoryResponse[]> {
    const callHistories = await this.callHistoryRepository.find({
      order: { callDateTime: 'DESC' },
    });

    return callHistories.map(item => this.mapToResponse(item));
  }

  async findOne(id: string): Promise<ICallHistoryResponse> {
    const callHistory = await this.callHistoryRepository.findOne({
      where: { id },
    });

    if (!callHistory) {
      throw new NotFoundException(`Call history with ID ${id} not found`);
    }

    return this.mapToResponse(callHistory);
  }

  async searchByCallerName(callerName: string): Promise<ICallHistoryResponse[]> {
    if (!callerName || callerName.trim() === '') {
      throw new BadRequestException('Caller name is required for search');
    }

    const callHistories = await this.callHistoryRepository
      .createQueryBuilder('callHistory')
      .where('callHistory.callerName IS NOT NULL')
      .andWhere('LOWER(callHistory.callerName) LIKE LOWER(:callerName)', {
        callerName: `%${callerName.trim()}%`,
      })
      .orderBy('callHistory.callDateTime', 'DESC')
      .getMany();

    return callHistories.map(item => this.mapToResponse(item));
  }

  async findByConversationId(conversationId: string): Promise<CallHistory | null> {
    return await this.callHistoryRepository.findOne({
      where: { conversationId },
    });
  }

  // Helper function to normalize isEscalation to enum value (handle legacy boolean values)
  private normalizeIsEscalation(value: any): 'not-requested' | 'successful' | 'unsuccessful' {
    if (value === 'not-requested' || value === 'successful' || value === 'unsuccessful') {
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
  }

  async createOrUpdateByConversationId(
    conversationId: string,
    updateData: Partial<CreateCallHistoryDto>
  ): Promise<ICallHistoryResponse> {
    const existing = await this.findByConversationId(conversationId);

    if (existing) {
      // Update existing record - only update provided fields
      if (updateData.callDateTime) {
        existing.callDateTime = new Date(updateData.callDateTime);
      }
      if (updateData.callerName !== undefined) existing.callerName = updateData.callerName ?? null;
      if (updateData.phoneNumber !== undefined) existing.phoneNumber = updateData.phoneNumber ?? null;
      if (updateData.duration !== undefined) existing.duration = updateData.duration ?? null;
      if (updateData.afterHours !== undefined) existing.afterHours = updateData.afterHours ?? null;
      if (updateData.facility !== undefined) existing.facility = updateData.facility ?? null;
      if (updateData.siteName !== undefined)
        existing.siteName = updateData.siteName ?? null;
      if (updateData.feedback !== undefined) existing.feedback = updateData.feedback || 'Neutral';
      if (updateData.handledBy !== undefined) existing.handledBy = updateData.handledBy ?? null;
      if (updateData.isTransferred !== undefined) existing.isTransferred = updateData.isTransferred;
      if (updateData.humanAgentName !== undefined) existing.humanAgentName = updateData.humanAgentName ?? null;
      if (updateData.callerNumber !== undefined) existing.callerNumber = updateData.callerNumber ?? null;
      if (updateData.callerEmail !== undefined) existing.callerEmail = updateData.callerEmail ?? null;
      if (updateData.isEscalation !== undefined) {
        // Normalize isEscalation to ensure it's always an enum value
        existing.isEscalation = this.normalizeIsEscalation(updateData.isEscalation);
      }
      if (updateData.rationale !== undefined) existing.rationale = updateData.rationale ?? null;
      if (updateData.callStatus !== undefined) existing.callStatus = updateData.callStatus ?? null;
      if (updateData.callSummary !== undefined) existing.callSummary = updateData.callSummary ?? null;

      const updated = await this.callHistoryRepository.save(existing);
      return this.mapToResponse(updated);
    } else {
      // Create new record
      return await this.create({
        ...updateData,
        conversationId,
        callDateTime: updateData.callDateTime || new Date().toISOString(),
      } as CreateCallHistoryDto);
    }
  }

  async remove(id: string): Promise<{ message: string }> {
    const callHistory = await this.callHistoryRepository.findOne({ where: { id } });

    if (!callHistory) {
      throw new NotFoundException(`Call history with ID ${id} not found`);
    }

    const conversationId = callHistory.conversationId;

    // Step 1: Delete from ElevenLabs first
    if (conversationId) {
      try {
        this.logger.log(`Deleting conversation from ElevenLabs: ${conversationId}`);
        await this.callTranscriptService.deleteConversationFromElevenLabs(conversationId);
        this.logger.log(`✅ Successfully deleted from ElevenLabs: ${conversationId}`);
      } catch (error: any) {
        // Log error but continue with DB deletion
        this.logger.warn(`⚠️ Failed to delete from ElevenLabs (continuing with DB deletion): ${error.message}`);
        // Continue with DB deletion even if ElevenLabs deletion fails
      }
    } else {
      this.logger.warn(`No conversationId found for call history ${id}, skipping ElevenLabs deletion`);
    }

    // Step 2: Delete transcript from database
    if (conversationId) {
      try {
        await this.callTranscriptService.removeByConversationId(conversationId);
        this.logger.log(`✅ Deleted transcript from database: ${conversationId}`);
      } catch (error: any) {
        // Log error but continue with call history deletion
        this.logger.warn(`⚠️ Failed to delete transcript (continuing): ${error.message}`);
      }
    }

    // Step 3: Delete call history from database
    await this.callHistoryRepository.remove(callHistory);
    this.logger.log(`✅ Deleted call history from database: ${id}`);

    return { message: 'Call history and related data deleted successfully' };
  }

  private mapToResponse(callHistory: CallHistory): ICallHistoryResponse {
    return {
      id: callHistory.id,
      conversationId: callHistory.conversationId,
      callerName: callHistory.callerName,
      phoneNumber: callHistory.phoneNumber,
      callDateTime: callHistory.callDateTime,
      duration: callHistory.duration,
      afterHours: callHistory.afterHours,
      callStatus: callHistory.callStatus,
      facility: callHistory.facility,
      siteName: callHistory.siteName,
      feedback: callHistory.feedback,
      handledBy: callHistory.handledBy,
      isTransferred: callHistory.isTransferred,
      humanAgentName: callHistory.humanAgentName,
      callerNumber: callHistory.callerNumber,
      callerEmail: callHistory.callerEmail,
      isEscalation: callHistory.isEscalation,
      rationale: callHistory.rationale,
      callSummary: callHistory.callSummary,
      createdAt: callHistory.createdAt,
      updatedAt: callHistory.updatedAt,
    };
  }
}

