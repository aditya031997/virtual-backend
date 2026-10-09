import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@/common/guards/auth.guard';
import { EmailReplyService } from '@/emailReply/emailReplyService';
import { CreateEmailReplyDto, UpdateEmailReplyDto, GenerateReplyDto } from '@/emailReply/dto';
import { IEmailReplyResponse } from '@/types/emailReply';
import { OpenAIHelper } from '@/helper/openai';

@ApiTags('Email Replies')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('email-reply')
export class EmailReplyController {
  private readonly logger = new Logger(EmailReplyController.name);

  constructor(
    private readonly emailReplyService: EmailReplyService,
    private readonly openAIHelper: OpenAIHelper,
  ) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate AI-powered email reply based on call transcript' })
  @ApiBody({ type: GenerateReplyDto })
  @ApiResponse({ status: HttpStatus.OK, description: 'Reply generated successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Failed to generate reply' })
  async generateReply(@Body() generateDto: GenerateReplyDto): Promise<{
    success: boolean;
    data: { generatedReply: string } | null;
    message: string;
  }> {
    this.logger.log(`Generating AI reply for customer: ${generateDto.customerName}`);

    try {
      const result = await this.openAIHelper.generateEmailReply({
        customerName: generateDto.customerName,
        customerEmail: generateDto.customerEmail,
        customerPhone: generateDto.customerPhone,
        subject: generateDto.subject,
        transcript: generateDto.transcript,
        emailBody: generateDto.emailBody,
        dealerCode: generateDto.dealerCode,
      });

      if (!result.success) {
        return {
          success: false,
          data: null,
          message: result.error || 'Failed to generate reply',
        };
      }

      return {
        success: true,
        data: { generatedReply: result.generatedReply! },
        message: 'Reply generated successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to generate reply: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create a new email reply (draft)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Reply created successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Support email not found' })
  async create(@Body() createDto: CreateEmailReplyDto): Promise<IEmailReplyResponse> {
    this.logger.log(`Creating email reply for support email: ${createDto.supportEmailId}`);

    try {
      const reply = await this.emailReplyService.create(createDto);
      return {
        success: true,
        data: reply,
        message: 'Email reply created successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to create reply: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get all email replies' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Replies retrieved successfully' })
  async findAll(): Promise<IEmailReplyResponse> {
    this.logger.log('Getting all email replies');

    try {
      const replies = await this.emailReplyService.findAll();
      return {
        success: true,
        data: replies,
        total: replies.length,
        message: 'Replies retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get replies: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Get('drafts')
  @ApiOperation({ summary: 'Get all draft replies' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Draft replies retrieved successfully' })
  async findDrafts(): Promise<IEmailReplyResponse> {
    this.logger.log('Getting draft replies');

    try {
      const replies = await this.emailReplyService.findDrafts();
      return {
        success: true,
        data: replies,
        total: replies.length,
        message: 'Draft replies retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get drafts: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Get('sent')
  @ApiOperation({ summary: 'Get all sent replies' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Sent replies retrieved successfully' })
  async findSent(): Promise<IEmailReplyResponse> {
    this.logger.log('Getting sent replies');

    try {
      const replies = await this.emailReplyService.findSent();
      return {
        success: true,
        data: replies,
        total: replies.length,
        message: 'Sent replies retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get sent replies: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Get('counts')
  @ApiOperation({ summary: 'Get counts for drafts and sent' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Counts retrieved successfully' })
  async getCounts(): Promise<{ success: boolean; data: { drafts: number; sent: number } | null; message: string }> {
    this.logger.log('Getting reply counts');

    try {
      const counts = await this.emailReplyService.getCounts();
      return {
        success: true,
        data: counts,
        message: 'Counts retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get counts: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Get('drafts/search')
  @ApiOperation({ summary: 'Search draft replies globally across all fields' })
  @ApiQuery({ name: 'q', description: 'Search term to find in any draft reply field' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Draft replies searched successfully' })
  async searchDrafts(@Query('q') searchTerm: string): Promise<IEmailReplyResponse> {
    this.logger.log(`Searching draft replies: ${searchTerm}`);

    try {
      const replies = await this.emailReplyService.searchDrafts(searchTerm);
      return {
        success: true,
        data: replies,
        total: replies.length,
        message: 'Draft replies searched successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to search drafts: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Get('sent/search')
  @ApiOperation({ summary: 'Search sent replies globally across all fields' })
  @ApiQuery({ name: 'q', description: 'Search term to find in any sent reply field' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Sent replies searched successfully' })
  async searchSent(@Query('q') searchTerm: string): Promise<IEmailReplyResponse> {
    this.logger.log(`Searching sent replies: ${searchTerm}`);

    try {
      const replies = await this.emailReplyService.searchSent(searchTerm);
      return {
        success: true,
        data: replies,
        total: replies.length,
        message: 'Sent replies searched successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to search sent replies: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Get('support-email/:supportEmailId')
  @ApiOperation({ summary: 'Get reply by support email ID' })
  @ApiParam({ name: 'supportEmailId', description: 'Support email ID (UUID)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Reply retrieved successfully' })
  async findBySupportEmailId(@Param('supportEmailId') supportEmailId: string): Promise<IEmailReplyResponse> {
    this.logger.log(`Getting reply for support email: ${supportEmailId}`);

    try {
      const reply = await this.emailReplyService.findBySupportEmailId(supportEmailId);
      return {
        success: true,
        data: reply,
        message: reply ? 'Reply retrieved successfully' : 'No reply found for this email',
      };
    } catch (error) {
      this.logger.error(`Failed to get reply: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get email reply by ID' })
  @ApiParam({ name: 'id', description: 'Email reply ID (UUID)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Reply retrieved successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Reply not found' })
  async findOne(@Param('id') id: string): Promise<IEmailReplyResponse> {
    this.logger.log(`Getting email reply: ${id}`);

    try {
      const reply = await this.emailReplyService.findOne(id);
      return {
        success: true,
        data: reply,
        message: 'Reply retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get reply: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update email reply (edit draft)' })
  @ApiParam({ name: 'id', description: 'Email reply ID (UUID)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Reply updated successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Reply not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Cannot edit sent reply' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateEmailReplyDto,
  ): Promise<IEmailReplyResponse> {
    this.logger.log(`Updating email reply: ${id}`);

    try {
      const reply = await this.emailReplyService.update(id, updateDto);
      return {
        success: true,
        data: reply,
        message: 'Reply updated successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to update reply: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send email reply' })
  @ApiParam({ name: 'id', description: 'Email reply ID (UUID)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Reply sent successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Reply not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Reply already sent' })
  async send(@Param('id') id: string): Promise<IEmailReplyResponse> {
    this.logger.log(`Sending email reply: ${id}`);

    try {
      const reply = await this.emailReplyService.send(id);
      return {
        success: true,
        data: reply,
        message: 'Reply sent successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to send reply: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete email reply' })
  @ApiParam({ name: 'id', description: 'Email reply ID (UUID)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Reply deleted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Reply not found' })
  async remove(@Param('id') id: string): Promise<IEmailReplyResponse> {
    this.logger.log(`Deleting email reply: ${id}`);

    try {
      const result = await this.emailReplyService.remove(id);
      return {
        success: true,
        data: null,
        message: result.message,
      };
    } catch (error) {
      this.logger.error(`Failed to delete reply: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }
}

