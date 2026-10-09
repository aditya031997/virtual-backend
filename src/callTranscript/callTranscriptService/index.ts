import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { CallTranscript } from '@/schema/callTranscript';
import { CreateCallTranscriptDto, UpdateCallTranscriptDto } from '@/callTranscript/dto';
import { ICallTranscriptResponse } from '@/types/callTranscript';

@Injectable()
export class CallTranscriptService {
  private readonly elevenLabsClient: ElevenLabsClient;
  private readonly logger = new Logger(CallTranscriptService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(CallTranscript)
    private readonly callTranscriptRepository: Repository<CallTranscript>,
  ) {
    const apiKey = this.configService.get<string>('ELEVENLABS_API_KEY');
    
    if (!apiKey) {
      this.logger.error('ELEVENLABS_API_KEY is not configured');
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    this.elevenLabsClient = new ElevenLabsClient({
      environment: 'https://api.elevenlabs.io/',
      apiKey,
    });

    this.logger.log('CallTranscriptService initialized successfully');
  }

  async create(createCallTranscriptDto: CreateCallTranscriptDto): Promise<ICallTranscriptResponse> {
    // Check if transcript already exists for this conversation
    const existing = await this.callTranscriptRepository.findOne({
      where: { conversationId: createCallTranscriptDto.conversationId },
    });

    if (existing) {
      // Update existing transcript
      existing.transcript = createCallTranscriptDto.transcript;
      const updated = await this.callTranscriptRepository.save(existing);
      return this.mapToResponse(updated);
    }

    const callTranscript = this.callTranscriptRepository.create(createCallTranscriptDto);
    const saved = await this.callTranscriptRepository.save(callTranscript);
    return this.mapToResponse(saved);
  }

  async findAll(): Promise<ICallTranscriptResponse[]> {
    const transcripts = await this.callTranscriptRepository.find({
      order: { createdAt: 'DESC' },
    });

    return transcripts.map(item => this.mapToResponse(item));
  }

  async findOne(id: string): Promise<ICallTranscriptResponse> {
    const transcript = await this.callTranscriptRepository.findOne({
      where: { id },
    });

    if (!transcript) {
      throw new NotFoundException(`Call transcript with ID ${id} not found`);
    }

    return this.mapToResponse(transcript);
  }

  async findByConversationId(conversationId: string): Promise<ICallTranscriptResponse | null> {
    const transcript = await this.callTranscriptRepository.findOne({
      where: { conversationId },
    });

    if (!transcript) {
      return null;
    }

    return this.mapToResponse(transcript);
  }

  async update(id: string, updateCallTranscriptDto: UpdateCallTranscriptDto): Promise<ICallTranscriptResponse> {
    const transcript = await this.callTranscriptRepository.findOne({ where: { id } });

    if (!transcript) {
      throw new NotFoundException(`Call transcript with ID ${id} not found`);
    }

    if (updateCallTranscriptDto.conversationId !== undefined) {
      transcript.conversationId = updateCallTranscriptDto.conversationId;
    }

    if (updateCallTranscriptDto.transcript !== undefined) {
      transcript.transcript = updateCallTranscriptDto.transcript;
    }

    const updated = await this.callTranscriptRepository.save(transcript);
    return this.mapToResponse(updated);
  }

  async remove(id: string): Promise<{ message: string }> {
    const transcript = await this.callTranscriptRepository.findOne({ where: { id } });

    if (!transcript) {
      throw new NotFoundException(`Call transcript with ID ${id} not found`);
    }

    await this.callTranscriptRepository.remove(transcript);
    return { message: 'Call transcript deleted successfully' };
  }

  /**
   * Delete transcript by conversation ID
   */
  async removeByConversationId(conversationId: string): Promise<{ message: string }> {
    const transcript = await this.callTranscriptRepository.findOne({
      where: { conversationId },
    });

    if (!transcript) {
      // Not an error if transcript doesn't exist - just return success
      return { message: 'Call transcript not found (may not exist)' };
    }

    await this.callTranscriptRepository.remove(transcript);
    return { message: 'Call transcript deleted successfully' };
  }

  /**
   * Delete conversation from ElevenLabs
   */
  async deleteConversationFromElevenLabs(conversationId: string): Promise<void> {
    if (!conversationId || conversationId.trim() === '') {
      throw new BadRequestException('Conversation ID is required');
    }

    // Validate conversation ID format (starts with 'conv_')
    if (!conversationId.startsWith('conv_')) {
      this.logger.warn(`Invalid conversation ID format: ${conversationId}. Skipping ElevenLabs deletion.`);
      return;
    }

    try {
      this.logger.log(`Deleting conversation from ElevenLabs: ${conversationId}`);
      await this.elevenLabsClient.conversationalAi.conversations.delete(conversationId);
      this.logger.log(`Successfully deleted conversation from ElevenLabs: ${conversationId}`);
    } catch (error: any) {
      // Log error but don't throw - we'll still delete from DB
      this.logger.error(`Failed to delete conversation from ElevenLabs ${conversationId}: ${error.message}`);
      
      // If conversation doesn't exist in ElevenLabs, that's okay
      if (error.statusCode === 404 || error.status === 404) {
        this.logger.warn(`Conversation ${conversationId} not found in ElevenLabs (may have been already deleted)`);
        return;
      }
      
      // For other errors, log but continue with DB deletion
      throw error; // Re-throw so caller can decide how to handle
    }
  }

  /**
   * Retrieve conversation audio from ElevenLabs by conversation ID
   * @param conversationId - The ElevenLabs conversation ID
   * @param res - Express response object to stream audio
   */
  async getConversationAudio(conversationId: string, res: Response): Promise<void> {
    if (!conversationId || conversationId.trim() === '') {
      throw new BadRequestException('Conversation ID is required');
    }

    // Validate conversation ID format (starts with 'conv_')
    if (!conversationId.startsWith('conv_')) {
      throw new BadRequestException('Invalid conversation ID format. Conversation ID must start with "conv_"');
    }

    try {
      this.logger.log(`Fetching conversation audio for ID: ${conversationId}`);

      const audioStream = await this.elevenLabsClient.conversationalAi.conversations.audio.get(conversationId);

      if (!audioStream) {
        throw new NotFoundException(`Audio for conversation with ID ${conversationId} not found`);
      }

      // Set appropriate headers for audio streaming
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="conversation_${conversationId}.mp3"`);
      res.setHeader('Cache-Control', 'no-cache');

      // Handle different response types from ElevenLabs SDK
      const audioStreamAny = audioStream as any;

      // Check if it's a Blob
      if (audioStreamAny && typeof audioStreamAny.arrayBuffer === 'function') {
        const arrayBuffer = await audioStreamAny.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.send(buffer);
      }
      // Check if it's a ReadableStream
      else if (audioStreamAny && typeof audioStreamAny.getReader === 'function') {
        const reader = audioStreamAny.getReader();
        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(Buffer.from(value));
            }
            res.end();
          } catch (error: any) {
            this.logger.error(`Error streaming audio: ${error.message}`, error.stack);
            if (!res.headersSent) {
              res.status(500).json({ error: 'Error streaming audio' });
            }
          }
        };
        await pump();
      }
      // Check if it's a Node.js stream with pipe method
      else if (audioStreamAny && typeof audioStreamAny.pipe === 'function') {
        audioStreamAny.pipe(res);
      }
      // Check if it's already a Buffer
      else if (Buffer.isBuffer(audioStreamAny)) {
        res.send(audioStreamAny);
      }
      // Check if it's a string
      else if (typeof audioStreamAny === 'string') {
        res.send(audioStreamAny);
      }
      // Fallback: try to convert to buffer
      else {
        try {
          const buffer = Buffer.from(audioStreamAny);
          res.send(buffer);
        } catch (conversionError: any) {
          this.logger.error(`Error converting audio stream to buffer: ${conversionError.message}`);
          throw new InternalServerErrorException('Unable to process audio stream format');
        }
      }

      this.logger.log(`Successfully retrieved conversation audio: ${conversationId}`);
    } catch (error: any) {
      this.logger.error(`Error retrieving conversation audio ${conversationId}: ${error.message}`, error.stack);

      // Handle specific error cases
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      // Handle ElevenLabs API errors
      if (error.statusCode === 404 || error.status === 404) {
        throw new NotFoundException(`Audio for conversation with ID ${conversationId} not found`);
      }

      if (error.statusCode === 400 || error.status === 400) {
        throw new BadRequestException('Invalid conversation ID or request');
      }

      if (error.statusCode === 401 || error.status === 401) {
        throw new InternalServerErrorException('Unauthorized access to ElevenLabs API. Please check your API key.');
      }

      if (error.statusCode === 403 || error.status === 403) {
        throw new InternalServerErrorException('Access forbidden. Please check your API permissions.');
      }

      // Handle network/timeout errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        throw new InternalServerErrorException('Failed to connect to ElevenLabs API. Please try again later.');
      }

      // Generic error handling
      throw new InternalServerErrorException(
        `Failed to retrieve conversation audio: ${error.message || 'Unknown error occurred'}`
      );
    }
  }

  private mapToResponse(transcript: CallTranscript): ICallTranscriptResponse {
    return {
      id: transcript.id,
      conversationId: transcript.conversationId,
      transcript: transcript.transcript,
      createdAt: transcript.createdAt,
      updatedAt: transcript.updatedAt,
    };
  }
}

