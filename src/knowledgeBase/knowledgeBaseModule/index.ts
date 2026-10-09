import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeBaseController } from '@/knowledgeBase/knowledgeBaseController';
import { KnowledgeBaseService } from '@/knowledgeBase/knowledgeBaseService';
import { SitemapService } from '@/knowledgeBase/sitemapService';
import { UploadAbortService } from '@/knowledgeBase/uploadAbortService';
import { Sitemap } from '@/schema/sitemap';
import { Link } from '@/schema/link';
import { KnowledgeBaseSource } from '@/schema/knowledgeBaseSource';
import { Document } from '@/schema';
import { User } from '@/schema/user/user.entity';
import { S3Service } from '@/helper/s3-bucket';
import { EmailService } from '@/helper/email-service';
import { IntentRateLimiterService } from '@/chatbotIntent/intentRateLimiterService';
import { ToolSecretGuard } from '@/common/guards/toolSecret.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Sitemap, Link, KnowledgeBaseSource, Document, User])],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService, SitemapService, UploadAbortService, S3Service, EmailService, IntentRateLimiterService, ToolSecretGuard],
  exports: [KnowledgeBaseService, SitemapService, UploadAbortService],
})
export class KnowledgeBaseModule { }