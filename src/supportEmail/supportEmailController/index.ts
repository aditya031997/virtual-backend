import {
  Controller,
  Get,
  Delete,
  Patch,
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
} from '@nestjs/swagger';
import { AuthGuard } from '@/common/guards/auth.guard';
import { SupportEmailService } from '@/supportEmail/supportEmailService';
import { ISupportEmailResponse } from '@/types/supportEmail';

@ApiTags('Support Email')
@Controller('support-email')
export class SupportEmailController {
  private readonly logger = new Logger(SupportEmailController.name);

  constructor(private readonly supportEmailService: SupportEmailService) {}

  @Get('fetch')
  @ApiOperation({
    summary: 'Fetch emails from IMAP and store in database',
    description:
      'Fetches emails from configured sender email address via IMAP and stores them in the database (public endpoint).',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Emails fetched and stored successfully' })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Failed to fetch emails' })
  async fetchAndStoreEmails(): Promise<ISupportEmailResponse> {
    try {
      const result = await this.supportEmailService.fetchAndStoreEmails();
      this.logger.log(
        `GET support-email/fetch -> success=${result.success} newEmails=${result.newEmails ?? 'n/a'} total=${result.total ?? 'n/a'} message=${result.message ?? ''}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`GET support-email/fetch failed: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all stored support emails' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Emails retrieved successfully' })
  async findAll(): Promise<ISupportEmailResponse> {
    this.logger.log('📧 Getting all stored support emails');

    try {
      const emails = await this.supportEmailService.findAll();
      return {
        success: true,
        data: emails,
        total: emails.length,
        message: `Retrieved ${emails.length} emails`,
      };
    } catch (error) {
      this.logger.error(`Failed to get emails: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Get('search')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search emails globally (subject, fromEmail, fromName, bodyText, bodyHtml, toEmails)' })
  @ApiQuery({ name: 'subject', description: 'Search term to find in any email field' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Search completed successfully' })
  async searchBySubject(@Query('subject') searchTerm: string): Promise<ISupportEmailResponse> {
    this.logger.log(`🔍 Searching emails globally with term: ${searchTerm}`);

    try {
      const emails = await this.supportEmailService.searchBySubject(searchTerm);
      return {
        success: true,
        data: emails,
        total: emails.length,
        message: `Found ${emails.length} emails matching '${searchTerm}'`,
      };
    } catch (error) {
      this.logger.error(`Failed to search emails: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get single support email by ID' })
  @ApiParam({ name: 'id', description: 'Support email ID (UUID)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Email retrieved successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Email not found' })
  async findOne(@Param('id') id: string): Promise<ISupportEmailResponse> {
    this.logger.log(`📧 Getting support email: ${id}`);

    try {
      const email = await this.supportEmailService.findOne(id);
      return {
        success: true,
        data: email,
        message: 'Email retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get email: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Patch(':id/read')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark email as read' })
  @ApiParam({ name: 'id', description: 'Support email ID (UUID)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Email marked as read' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Email not found' })
  async markAsRead(@Param('id') id: string): Promise<ISupportEmailResponse> {
    this.logger.log(`📧 Marking email as read: ${id}`);

    try {
      const email = await this.supportEmailService.markAsRead(id);
      return {
        success: true,
        data: email,
        message: 'Email marked as read',
      };
    } catch (error) {
      this.logger.error(`Failed to mark email as read: ${error.message}`);
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete support email' })
  @ApiParam({ name: 'id', description: 'Support email ID (UUID)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Email deleted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Email not found' })
  async remove(@Param('id') id: string): Promise<{ success: boolean; message: string }> {
    this.logger.log(`📧 Deleting support email: ${id}`);

    try {
      const result = await this.supportEmailService.remove(id);
      return {
        success: true,
        message: result.message,
      };
    } catch (error) {
      this.logger.error(`Failed to delete email: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }
}

