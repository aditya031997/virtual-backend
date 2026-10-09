import {
  Controller,
  Post,
  Delete,
  Get,
  Patch,
  UseInterceptors,
  UploadedFile,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  UseGuards,
  Req,
  Ip,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { ToolSecretGuard } from '@/common/guards/toolSecret.guard';
import type { IAuthenticatedRequest } from '@/types';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import { KnowledgeBaseService } from '@/knowledgeBase/knowledgeBaseService';
import { SitemapService } from '@/knowledgeBase/sitemapService';
import { UploadAbortService } from '@/knowledgeBase/uploadAbortService';
import { UploadKnowledgeBaseDto, UploadUrlDto, UploadTextDto, UpdateDocumentDto, AddSitemapDto, SyncSitemapDto, ProcessBatchDto, FinalizeSitemapDto } from '@/knowledgeBase/dto';
import { IntentRateLimiterService } from '@/chatbotIntent/intentRateLimiterService';

@ApiTags('Knowledge Base')
@Controller('knowledge-base')
export class KnowledgeBaseController {
  private readonly logger = new Logger(KnowledgeBaseController.name);

  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly sitemapService: SitemapService,
    private readonly uploadAbortService: UploadAbortService,
    private readonly rateLimiterService: IntentRateLimiterService,
  ) { }

  // ------------------------ UPLOAD FILE ------------------------
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload content and attach to agent' })
  @ApiConsumes('multipart/form-data')
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadKnowledgeBaseDto,
  ) {
    const { agentId, url, text, name } = body;

    if (!file && !url && !text) {
      throw new HttpException(
        'Provide at least one: file, url, or text',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return await this.knowledgeBaseService.uploadContentAndAttachAgent(
        { file, url, text, name },
        agentId,
      );
    } catch (error: any) {
      // Check if error is related to file name too long
      const errorMessage = String(error.message || '');
      if (
        errorMessage.includes('File name too long') ||
        errorMessage.includes('ENAMETOOLONG') ||
        errorMessage.includes('name too long') ||
        error.code === 'ENAMETOOLONG'
      ) {
        throw new HttpException('Knowledge base upload failed: file name too long', HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(error.message || String(error), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ------------------------ UPLOAD URL ------------------------
  @Post('url')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Upload URL to knowledge base and attach to agent' })
  @ApiBody({ type: UploadUrlDto })
  async uploadUrl(
    @Body() body: UploadUrlDto,
    @Req() req: IAuthenticatedRequest,
  ) {
    if (!body.url) {
      throw new HttpException('URL is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const userId = req.user.sub;
      return await this.knowledgeBaseService.uploadUrlAndAttachAgent(body.url, userId);
    } catch (error: any) {
      throw new HttpException(error.message || String(error), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ------------------------ UPLOAD TEXT ------------------------
  @Post('text')
  @ApiOperation({ summary: 'Upload text to knowledge base and attach to agent' })
  @ApiBody({ type: UploadTextDto })
  async uploadText(@Body() body: UploadTextDto) {
    if (!body.text) {
      throw new HttpException('Text is required', HttpStatus.BAD_REQUEST);
    }

    try {
      return await this.knowledgeBaseService.uploadTextAndAttachAgent(body.text);
    } catch (error: any) {
      throw new HttpException(error.message || String(error), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ------------------------ UPDATE DOCUMENT ------------------------
  @Patch('updateDocument/:documentId')
  @ApiOperation({ summary: 'Update document name in knowledge base' })
  @ApiParam({ name: 'documentId', description: 'Document ID to update' })
  @ApiBody({ type: UpdateDocumentDto })
  async updateDocument(
    @Param('documentId') documentId: string,
    @Body() body: UpdateDocumentDto,
  ) {
    if (!documentId) {
      throw new HttpException('Document ID is required', HttpStatus.BAD_REQUEST);
    }

    if (!body.name) {
      throw new HttpException('Document name is required', HttpStatus.BAD_REQUEST);
    }

    try {
      return await this.knowledgeBaseService.updateDocument(documentId, body.name);
    } catch (error: any) {
      if ((error.message || '').includes('not found')) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException(error.message || String(error), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ------------------------ SITEMAP ------------------------
  // ------------------------ SITEMAP ------------------------
  @Post('sitemap')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Add sitemap, extract URLs, and attach to agent' })
  @ApiBody({ type: AddSitemapDto })
  async addSitemap(
    @Body() body: AddSitemapDto,
    @Req() req: IAuthenticatedRequest,
  ) {
    if (!body.url) throw new HttpException('Sitemap URL is required', HttpStatus.BAD_REQUEST);

    try {
      const userId = req.user.sub;
      return await this.sitemapService.addSitemap(body.url, userId);
    } catch (error: any) {
      throw new HttpException(error.message || String(error), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('sitemap/:sitemapId/progress')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get real-time progress for a sitemap upload' })
  @ApiParam({ name: 'sitemapId', description: 'Sitemap ID' })
  async getSitemapProgress(
    @Param('sitemapId') sitemapId: string,
    @Req() req: IAuthenticatedRequest,
  ) {
    if (!sitemapId) throw new HttpException('Sitemap ID is required', HttpStatus.BAD_REQUEST);

    try {
      const userId = req.user.sub;
      return await this.sitemapService.getSitemapProgress(sitemapId, userId);
    } catch (error: any) {
      throw new HttpException(error.message || String(error), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('sitemap/process-batch')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Process next pending URL for a sitemap (1 at a time for real-time progress)' })
  @ApiBody({ type: ProcessBatchDto })
  async processBatch(
    @Body() body: ProcessBatchDto,
    @Req() req: IAuthenticatedRequest,
  ) {
    if (!body.sitemapId) throw new HttpException('Sitemap ID is required', HttpStatus.BAD_REQUEST);

    try {
      const userId = req.user.sub;
      return await this.sitemapService.processBatch(body.sitemapId, userId, 1);
    } catch (error: any) {
      throw new HttpException(error.message || String(error), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('sitemap/finalize')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Finalize sitemap: attach all uploaded docs to agent and mark as success' })
  @ApiBody({ type: FinalizeSitemapDto })
  async finalizeSitemap(
    @Body() body: FinalizeSitemapDto,
    @Req() req: IAuthenticatedRequest,
  ) {
    if (!body.sitemapId) throw new HttpException('Sitemap ID is required', HttpStatus.BAD_REQUEST);

    try {
      const userId = req.user.sub;
      return await this.sitemapService.finalizeSitemap(body.sitemapId, userId);
    } catch (error: any) {
      throw new HttpException(error.message || String(error), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('sitemap/sync')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Sync sitemap and add new URLs' })
  @ApiBody({ type: SyncSitemapDto })
  async syncSitemap(
    @Body() body: SyncSitemapDto,
    @Req() req: IAuthenticatedRequest,
  ) {
    if (!body.sitemapId) throw new HttpException('Sitemap ID is required', HttpStatus.BAD_REQUEST);

    try {
      const userId = req.user.sub;
      return await this.sitemapService.syncSitemap(body.sitemapId, userId);
    } catch (error: any) {
      throw new HttpException(error.message || String(error), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('sitemap/pending')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Check for pending (incomplete) sitemaps for current user' })
  async getPendingSitemaps(@Req() req: IAuthenticatedRequest) {
    try {
      const userId = req.user.sub;
      return await this.sitemapService.getPendingSitemaps(userId);
    } catch (error: any) {
      throw new HttpException(error.message || String(error), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('sitemap/cleanup-pending')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Cleanup all pending (incomplete) sitemaps for current user' })
  async cleanupPendingSitemaps(@Req() req: IAuthenticatedRequest) {
    try {
      const userId = req.user.sub;
      return await this.sitemapService.cleanupPendingSitemaps(userId);
    } catch (error: any) {
      throw new HttpException(error.message || String(error), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('sitemap/abort')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Abort ongoing sitemap upload for current user' })
  async abortSitemapUpload(@Req() req: IAuthenticatedRequest) {
    const userId = req.user.sub;
    this.uploadAbortService.setAbort(userId);

    return {
      success: true,
      message: 'Upload abort requested',
      userId,
    };
  }

  // ------------------------ DELETE ------------------------
  @Delete('sitemap/:sitemapId')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Delete sitemap and all associated links' })
  @ApiParam({ name: 'sitemapId', description: 'Sitemap ID to delete' })
  async deleteSitemap(
    @Param('sitemapId') sitemapId: string,
    @Req() req: IAuthenticatedRequest,
  ) {
    if (!sitemapId) throw new HttpException('Sitemap ID is required', HttpStatus.BAD_REQUEST);

    try {
      const userId = req.user.sub;
      return await this.sitemapService.deleteSitemap(sitemapId, userId);
    } catch (error: any) {
      if ((error.message || '').includes('not found')) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException(error.message || String(error), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete('document/:documentId')
  @ApiOperation({
    summary: 'Remove document from agent and delete from knowledge base',
  })
  @ApiParam({ name: 'documentId', description: 'Document ID to remove and delete' })
  async removeAndDeleteDocument(@Param('documentId') documentId: string) {
    if (!documentId) {
      throw new HttpException('Document ID is required', HttpStatus.BAD_REQUEST);
    }

    try {
      return await this.knowledgeBaseService.removeDocumentAndDeleteFromKnowledgeBase(documentId);
    } catch (error: any) {
      if ((error.message || '').includes('not found')) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException(error.message || String(error), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('sitemap/:sitemapId/links')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get all child links for a sitemap' })
  @ApiParam({ name: 'sitemapId', description: 'Sitemap ID' })
  async getSitemapLinks(
    @Param('sitemapId') sitemapId: string,
  ) {
    if (!sitemapId) throw new HttpException('Sitemap ID is required', HttpStatus.BAD_REQUEST);

    try {
      return await this.knowledgeBaseService.getSitemapLinks(sitemapId);
    } catch (error: any) {
      throw new HttpException(error.message || String(error), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ------------------------ GET ALL DOCUMENTS ------------------------
  @Get('documents')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get all documents in knowledge base' })
  async getAllDocuments(@Req() req: IAuthenticatedRequest) {
    try {
      const userId = req.user.sub;
      return await this.knowledgeBaseService.getAllDocuments(userId);
    } catch (error: any) {
      throw new HttpException(error.message || String(error), HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('document/:documentId/content')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get document content from knowledge base' })
  @ApiParam({ name: 'documentId', description: 'ElevenLabs document ID' })
  async getDocumentContent(@Param('documentId') documentId: string) {
    if (!documentId) {
      throw new HttpException('Document ID is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.knowledgeBaseService.getDocumentContent(documentId);
      return result;
    } catch (error: any) {
      const message = error.message || String(error);

      if (message.includes('not found')) {
        throw new HttpException(message, HttpStatus.NOT_FOUND);
      }
      if (message.includes('Invalid') || message.includes('format')) {
        throw new HttpException(message, HttpStatus.BAD_REQUEST);
      }

      // An ElevenLabs auth failure is OUR credential problem, not the caller's.
      // Forwarding it as 401 made the admin panel treat it as an expired session
      // and log the user out mid-preview. Report it as an upstream failure and
      // never leak the third-party message to the client.
      if (message.includes('Authentication')) {
        this.logger.error(
          `ElevenLabs auth failed while fetching content for document ${documentId}: ${message}`,
        );
        throw new HttpException(
          'Document preview is temporarily unavailable. Please try again later.',
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.logger.error(`Failed to fetch document content for ${documentId}: ${message}`);
      throw new HttpException(
        'Failed to fetch document content',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Search the knowledge base and email the matching document.
   *
   * Called by the ElevenLabs agent as a server tool, so it carries no user
   * session and AuthGuard cannot be used — that would 401 every call. It is
   * instead authenticated by ToolSecretGuard, a shared secret sent as
   * x-tool-secret and configured in the tool's header config in the ElevenLabs
   * dashboard. Without it this route was reachable by anyone who knew the URL,
   * which made it an open relay for our own documents.
   *
   * The secret authenticates the agent, not the customer. It says the request
   * came from us; it says nothing about who may receive a given document, so
   * it is not a substitute for the per-document entitlement check.
   *
   * Rate limiting is kept alongside it. The two answer different questions —
   * the secret bounds who may call, the limit bounds how often one address can
   * be mailed — and a leaked secret should not also mean unlimited sending.
   * Keyed per recipient address rather than per IP: the agent's calls all
   * arrive from one ElevenLabs egress address, so an IP key would let a single
   * conversation exhaust the quota for every other.
   */
  @Get('search-email')
  @UseGuards(ToolSecretGuard)
  @ApiOperation({ summary: 'Search internal knowledge base and email the matching source' })
  @ApiQuery({ name: 'query', description: 'Query to search against the internal knowledge base', required: true })
  @ApiQuery({ name: 'email', description: 'Recipient email address', required: true })
  @ApiQuery({ name: 'user_name', description: 'Recipient display name used in the email greeting', required: true })
  async searchAndEmailKnowledgeBaseResult(
    @Query('query') query: string,
    @Query('email') email: string,
    @Query('user_name') userName: string,
    @Ip() ip: string,
  ) {
    if (!query) {
      throw new HttpException('Query is required', HttpStatus.BAD_REQUEST);
    }

    if (!email) {
      throw new HttpException('Email is required', HttpStatus.BAD_REQUEST);
    }

    if (!userName) {
      throw new HttpException('user_name is required', HttpStatus.BAD_REQUEST);
    }

    // Lower-cased so casing variations of one address cannot each claim a fresh
    // quota. Falls back to the caller's IP if the address is somehow unusable,
    // so the endpoint is never left unlimited.
    const normalisedEmail = email.trim().toLowerCase();
    const rateLimitKey = normalisedEmail
      ? `kb-email:${normalisedEmail}`
      : `kb-email-ip:${ip}`;

    if (!this.rateLimiterService.consume(rateLimitKey)) {
      const retryAfter =
        this.rateLimiterService.getRetryAfterSeconds(rateLimitKey);

      this.logger.warn(
        `Rate limited knowledge-base email request for ${normalisedEmail || ip}`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please wait a moment and try again.',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      return await this.knowledgeBaseService.searchAndEmailKnowledgeBaseResult(query, email, userName);
    } catch (error: any) {
      const message = error.message || String(error);

      if (message.includes('No search results') || message.includes('No source file found')) {
        throw new HttpException(message, HttpStatus.NOT_FOUND);
      }

      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}