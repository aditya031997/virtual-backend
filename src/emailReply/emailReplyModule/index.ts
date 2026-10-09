import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailReply } from '@/schema/emailReply';
import { SupportEmail } from '@/schema/supportEmail';
import { EmailReplyService } from '@/emailReply/emailReplyService';
import { EmailReplyController } from '@/emailReply/emailReplyController';
import { EmailService } from '@/helper/email-service';
import { OpenAIHelper } from '@/helper/openai';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailReply, SupportEmail]),
    ConfigModule,
  ],
  controllers: [EmailReplyController],
  providers: [EmailReplyService, EmailService, OpenAIHelper],
  exports: [EmailReplyService],
})
export class EmailReplyModule {}

