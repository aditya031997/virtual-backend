import { Controller, Get, Post, Body, Param, Delete, Query, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import { CallHistoryService } from '@/callHistory/callHistoryService';
import { CreateCallHistoryDto } from '@/callHistory/dto';
import { AuthGuard } from '@/common/guards/auth.guard';
import { ICallHistoryResponse } from '@/types/callHistory';

@Controller('call-history')
export class CallHistoryController {
  constructor(private readonly callHistoryService: CallHistoryService) {}

  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new call history entry' })
  @ApiBody({ type: CreateCallHistoryDto })
  async create(@Body() createCallHistoryDto: CreateCallHistoryDto): Promise<ICallHistoryResponse> {
    return await this.callHistoryService.create(createCallHistoryDto);
  }

  @Get('getAll')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get all call history entries' })
  async findAll(): Promise<ICallHistoryResponse[]> {
    return await this.callHistoryService.findAll();
  }

  @Get('getById/:id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get call history by ID' })
  @ApiParam({ name: 'id', description: 'Call history ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ICallHistoryResponse> {
    return await this.callHistoryService.findOne(id);
  }

  @Get('search')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Search call history by caller name' })
  @ApiQuery({ name: 'callerName', description: 'Caller name to search for (partial match, case-insensitive)', required: true })
  async searchByCallerName(@Query('callerName') callerName: string): Promise<ICallHistoryResponse[]> {
    return await this.callHistoryService.searchByCallerName(callerName);
  }

  @Delete('delete/:id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Delete call history entry' })
  @ApiParam({ name: 'id', description: 'Call history ID' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return await this.callHistoryService.remove(id);
  }
}

