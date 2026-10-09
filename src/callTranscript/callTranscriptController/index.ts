import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { CallTranscriptService } from '@/callTranscript/callTranscriptService';
import { CreateCallTranscriptDto, UpdateCallTranscriptDto } from '@/callTranscript/dto';
import { ICallTranscriptResponse } from '@/types/callTranscript';

@Controller('call-transcript')
export class CallTranscriptController {
  constructor(private readonly callTranscriptService: CallTranscriptService) {}

  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new call transcript' })
  @ApiResponse({ status: 201, description: 'Call transcript created successfully' })
  async create(@Body() createCallTranscriptDto: CreateCallTranscriptDto): Promise<ICallTranscriptResponse> {
    return this.callTranscriptService.create(createCallTranscriptDto);
  }

  @Get('getAll')
  @ApiOperation({ summary: 'Get all call transcripts' })
  @ApiResponse({ status: 200, description: 'List of all call transcripts' })
  async findAll(): Promise<ICallTranscriptResponse[]> {
    return this.callTranscriptService.findAll();
  }

  @Get('conversation/:conversationId')
  @ApiOperation({ summary: 'Get call transcript by conversation ID' })
  @ApiResponse({ status: 200, description: 'Call transcript found' })
  @ApiResponse({ status: 404, description: 'Call transcript not found' })
  async findByConversationId(@Param('conversationId') conversationId: string): Promise<ICallTranscriptResponse | null> {
    return this.callTranscriptService.findByConversationId(conversationId);
  }

  @Get('conversationAudio/:conversationId')
  @ApiOperation({ summary: 'Get conversation audio from ElevenLabs' })
  @ApiResponse({ status: 200, description: 'Audio stream retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid conversation ID' })
  @ApiResponse({ status: 404, description: 'Conversation audio not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getConversationAudio(
    @Param('conversationId') conversationId: string,
    @Res() res: Response,
  ): Promise<void> {
    return this.callTranscriptService.getConversationAudio(conversationId, res);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a call transcript by ID' })
  @ApiResponse({ status: 200, description: 'Call transcript found' })
  @ApiResponse({ status: 404, description: 'Call transcript not found' })
  async findOne(@Param('id') id: string): Promise<ICallTranscriptResponse> {
    return this.callTranscriptService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a call transcript' })
  @ApiResponse({ status: 200, description: 'Call transcript updated successfully' })
  @ApiResponse({ status: 404, description: 'Call transcript not found' })
  async update(
    @Param('id') id: string,
    @Body() updateCallTranscriptDto: UpdateCallTranscriptDto,
  ): Promise<ICallTranscriptResponse> {
    return this.callTranscriptService.update(id, updateCallTranscriptDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a call transcript' })
  @ApiResponse({ status: 204, description: 'Call transcript deleted successfully' })
  @ApiResponse({ status: 404, description: 'Call transcript not found' })
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    return this.callTranscriptService.remove(id);
  }
}

