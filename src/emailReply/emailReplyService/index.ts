import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailReply } from '@/schema/emailReply';
import { SupportEmail } from '@/schema/supportEmail';
import { IEmailReply, IEmailReplyResponse, IEmailReplyWithOriginal } from '@/types/emailReply';
import { CreateEmailReplyDto, UpdateEmailReplyDto } from '@/emailReply/dto';
import { EmailService } from '@/helper/email-service';

@Injectable()
export class EmailReplyService {
  private readonly logger = new Logger(EmailReplyService.name);

  constructor(
    @InjectRepository(EmailReply)
    private readonly emailReplyRepository: Repository<EmailReply>,
    @InjectRepository(SupportEmail)
    private readonly supportEmailRepository: Repository<SupportEmail>,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Create a new email reply (draft)
   */
  async create(createDto: CreateEmailReplyDto): Promise<IEmailReply> {
    // Verify support email exists
    const supportEmail = await this.supportEmailRepository.findOne({
      where: { id: createDto.supportEmailId },
    });

    if (!supportEmail) {
      throw new NotFoundException(`Support email with ID ${createDto.supportEmailId} not found`);
    }

    const reply = this.emailReplyRepository.create({
      ...createDto,
      status: createDto.status || 'draft',
    });

    const saved = await this.emailReplyRepository.save(reply);
    this.logger.log(`Created email reply: ${saved.id} for support email: ${createDto.supportEmailId}`);
    
    return this.mapToResponse(saved);
  }

  /**
   * Get all email replies
   */
  async findAll(): Promise<IEmailReply[]> {
    const replies = await this.emailReplyRepository.find({
      order: { createdAt: 'DESC' },
    });
    return replies.map(r => this.mapToResponse(r));
  }

  /**
   * Get all draft replies
   */
  async findDrafts(): Promise<IEmailReplyWithOriginal[]> {
    const replies = await this.emailReplyRepository.find({
      where: { status: 'draft' },
      relations: ['supportEmail'],
      order: { createdAt: 'DESC' },
    });
    return replies.map(r => this.mapToResponseWithOriginal(r));
  }

  /**
   * Get all sent replies
   */
  async findSent(): Promise<IEmailReplyWithOriginal[]> {
    const replies = await this.emailReplyRepository.find({
      where: { status: 'sent' },
      relations: ['supportEmail'],
      order: { updatedAt: 'DESC' },
    });
    return replies.map(r => this.mapToResponseWithOriginal(r));
  }

  /**
   * Get reply by ID
   */
  async findOne(id: string): Promise<IEmailReplyWithOriginal> {
    const reply = await this.emailReplyRepository.findOne({
      where: { id },
      relations: ['supportEmail'],
    });

    if (!reply) {
      throw new NotFoundException(`Email reply with ID ${id} not found`);
    }

    return this.mapToResponseWithOriginal(reply);
  }

  /**
   * Get reply by support email ID
   */
  async findBySupportEmailId(supportEmailId: string): Promise<IEmailReply | null> {
    const reply = await this.emailReplyRepository.findOne({
      where: { supportEmailId },
      order: { createdAt: 'DESC' },
    });

    return reply ? this.mapToResponse(reply) : null;
  }

  /**
   * Update email reply (edit draft)
   */
  async update(id: string, updateDto: UpdateEmailReplyDto): Promise<IEmailReply> {
    const reply = await this.emailReplyRepository.findOne({ where: { id } });

    if (!reply) {
      throw new NotFoundException(`Email reply with ID ${id} not found`);
    }

    // Only allow editing drafts
    if (reply.status === 'sent') {
      throw new BadRequestException('Cannot edit a sent reply');
    }

    if (updateDto.subject !== undefined) reply.subject = updateDto.subject;
    if (updateDto.replyContent !== undefined) reply.replyContent = updateDto.replyContent;
    if (updateDto.status !== undefined) reply.status = updateDto.status;

    const updated = await this.emailReplyRepository.save(reply);
    this.logger.log(`Updated email reply: ${id}`);

    return this.mapToResponse(updated);
  }

  /**
   * Send email reply (change status to sent and actually send email)
   */
  async send(id: string): Promise<IEmailReply> {
    const reply = await this.emailReplyRepository.findOne({
      where: { id },
      relations: ['supportEmail'],
    });

    if (!reply) {
      throw new NotFoundException(`Email reply with ID ${id} not found`);
    }

    if (reply.status === 'sent') {
      throw new BadRequestException('Reply has already been sent');
    }

    // Send the actual email - only subject and reply content
    const emailResult = await this.emailService.sendEmail({
      from: reply.fromEmail, // Use the reply's fromEmail as sender
      to: reply.toEmail,
      subject: reply.subject || 'Re: Your inquiry',
      body: {
        text: reply.replyContent,
        html: this.formatHtmlEmail(reply.replyContent),
      },
    });

    if (!emailResult.success) {
      this.logger.error(`Failed to send email: ${emailResult.error}`);
      throw new BadRequestException(`Failed to send email: ${emailResult.error}`);
    }

    // Update status to sent
    reply.status = 'sent';

    const updated = await this.emailReplyRepository.save(reply);
    this.logger.log(`Sent email reply: ${id} to ${reply.toEmail}`);

    return this.mapToResponse(updated);
  }

  /**
   * Delete email reply
   */
  async remove(id: string): Promise<{ message: string }> {
    const reply = await this.emailReplyRepository.findOne({ where: { id } });

    if (!reply) {
      throw new NotFoundException(`Email reply with ID ${id} not found`);
    }

    await this.emailReplyRepository.remove(reply);
    this.logger.log(`Deleted email reply: ${id}`);

    return { message: 'Email reply deleted successfully' };
  }

  /**
   * Get counts for tabs
   */
  async getCounts(): Promise<{ drafts: number; sent: number }> {
    const [drafts, sent] = await Promise.all([
      this.emailReplyRepository.count({ where: { status: 'draft' } }),
      this.emailReplyRepository.count({ where: { status: 'sent' } }),
    ]);

    return { drafts, sent };
  }

  /**
   * Search draft replies globally across all fields
   */
  async searchDrafts(searchTerm: string): Promise<IEmailReplyWithOriginal[]> {
    if (!searchTerm || searchTerm.trim() === '') {
      return this.findDrafts();
    }

    const searchPattern = `%${searchTerm.trim()}%`;

    const replies = await this.emailReplyRepository
      .createQueryBuilder('reply')
      .leftJoinAndSelect('reply.supportEmail', 'supportEmail')
      .where('reply.status = :status', { status: 'draft' })
      .andWhere(
        '(LOWER(COALESCE(reply.subject, \'\')) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(reply.fromEmail) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(reply.toEmail) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(COALESCE(reply.replyContent, \'\')) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(COALESCE(supportEmail.subject, \'\')) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(COALESCE(supportEmail.fromEmail, \'\')) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(COALESCE(supportEmail.fromName, \'\')) LIKE LOWER(:searchTerm))',
        { searchTerm: searchPattern }
      )
      .orderBy('reply.createdAt', 'DESC')
      .getMany();

    return replies.map(r => this.mapToResponseWithOriginal(r));
  }

  /**
   * Search sent replies globally across all fields
   */
  async searchSent(searchTerm: string): Promise<IEmailReplyWithOriginal[]> {
    if (!searchTerm || searchTerm.trim() === '') {
      return this.findSent();
    }

    const searchPattern = `%${searchTerm.trim()}%`;

    const replies = await this.emailReplyRepository
      .createQueryBuilder('reply')
      .leftJoinAndSelect('reply.supportEmail', 'supportEmail')
      .where('reply.status = :status', { status: 'sent' })
      .andWhere(
        '(LOWER(COALESCE(reply.subject, \'\')) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(reply.fromEmail) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(reply.toEmail) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(COALESCE(reply.replyContent, \'\')) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(COALESCE(supportEmail.subject, \'\')) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(COALESCE(supportEmail.fromEmail, \'\')) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(COALESCE(supportEmail.fromName, \'\')) LIKE LOWER(:searchTerm))',
        { searchTerm: searchPattern }
      )
      .orderBy('reply.updatedAt', 'DESC')
      .getMany();

    return replies.map(r => this.mapToResponseWithOriginal(r));
  }

  /**
   * Format reply content as HTML email
   */
  private formatHtmlEmail(content: string): string {
    // Convert line breaks to <br> and wrap in basic HTML
    const formattedContent = content.replace(/\n/g, '<br>');
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 8px; }
    .footer { margin-top: 20px; font-size: 12px; color: #888; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="content">
      ${formattedContent}
    </div>
    <div class="footer">
      <p>This email was sent from SmartCaller Support</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Map entity to response
   */
  private mapToResponse(reply: EmailReply): IEmailReply {
    return {
      id: reply.id,
      supportEmailId: reply.supportEmailId,
      fromEmail: reply.fromEmail,
      toEmail: reply.toEmail,
      subject: reply.subject,
      replyContent: reply.replyContent,
      status: reply.status,
      createdAt: reply.createdAt,
      updatedAt: reply.updatedAt,
    };
  }

  /**
   * Map entity to response with original email
   */
  private mapToResponseWithOriginal(reply: EmailReply): IEmailReplyWithOriginal {
    const response: IEmailReplyWithOriginal = this.mapToResponse(reply);
    
    if (reply.supportEmail) {
      response.originalEmail = {
        id: reply.supportEmail.id,
        subject: reply.supportEmail.subject,
        fromEmail: reply.supportEmail.fromEmail,
        fromName: reply.supportEmail.fromName,
      };
    }

    return response;
  }
}

