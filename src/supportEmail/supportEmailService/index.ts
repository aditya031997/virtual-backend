import { Injectable, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Imap = require('imap');
import { simpleParser, ParsedMail, AddressObject } from 'mailparser';
import { SupportEmail } from '@/schema/supportEmail';
import { ISupportEmail, ISupportEmailResponse, IImapConfig } from '@/types/supportEmail';
import { SSEService } from '@/sse/sseService';

@Injectable()
export class SupportEmailService {
  private readonly logger = new Logger(SupportEmailService.name);
  private readonly imapConfig: IImapConfig;
  private readonly SENDER_FILTER: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(SupportEmail)
    private readonly supportEmailRepository: Repository<SupportEmail>,
    private readonly sseService: SSEService,
  ) {
    // Get sender filter from environment variable (same as SES_FROM_EMAIL used in EmailService)
    this.SENDER_FILTER = this.configService.get<string>('SES_FROM_EMAIL') || 'sender@example.com';
    
    this.imapConfig = {
      host: this.configService.get<string>('IMAP_HOST', 'imap.gmail.com'),
      port: this.configService.get<number>('IMAP_PORT', 993),
      user: this.configService.get<string>('IMAP_USER', ''),
      password: this.configService.get<string>('IMAP_PASSWORD', ''),
      tls: this.configService.get<string>('IMAP_TLS', 'true') === 'true',
      tlsOptions: {
        rejectUnauthorized: false,
      },
    };
  }

  /**
   * Create IMAP connection
   */
  private createConnection(): Imap {
    return new Imap({
      user: this.imapConfig.user,
      password: this.imapConfig.password,
      host: this.imapConfig.host,
      port: this.imapConfig.port,
      tls: this.imapConfig.tls,
      tlsOptions: this.imapConfig.tlsOptions,
    });
  }

  /**
   * Fetch emails from IMAP, filter by sender, and store in database
   * @param emitSSE - Whether to emit SSE event when new emails are found (default: false)
   */
  async fetchAndStoreEmails(emitSSE: boolean = false): Promise<ISupportEmailResponse> {
    this.logger.debug(
      `IMAP sync start host=${this.imapConfig.host} user=${this.imapConfig.user} filterFrom=${this.SENDER_FILTER}`,
    );

    return new Promise((resolve, reject) => {
      const imap = this.createConnection();

      imap.once('ready', () => {
        this.logger.debug('IMAP connection ready');

        imap.openBox('INBOX', true, async (err, box) => {
          if (err) {
            this.logger.error(`Failed to open mailbox: ${err.message}`);
            imap.end();
            return reject(new InternalServerErrorException(`Failed to open mailbox: ${err.message}`));
          }

          this.logger.debug(`INBOX opened, total messages: ${box.messages.total}`);

          if (box.messages.total === 0) {
            imap.end();
            return resolve({
              success: true,
              data: [],
              total: 0,
              newEmails: 0,
              message: 'No emails in inbox',
            });
          }

          // Get the highest UID from database to only fetch newer emails
          const maxUid = await this.getMaxUidFromDb();
          this.logger.debug(`Highest UID in database: ${maxUid ?? 'none'}`);

          // Search for emails from SmartCaller only, with UID greater than maxUid
          let searchCriteria: any[];
          if (maxUid && maxUid > 0) {
            // Fetch only emails with UID > maxUid
            searchCriteria = [['FROM', this.SENDER_FILTER], ['UID', `${maxUid + 1}:*`]];
            this.logger.debug(`IMAP search FROM ${this.SENDER_FILTER} UID > ${maxUid}`);
          } else {
            // First time - fetch all emails from sender
            searchCriteria = [['FROM', this.SENDER_FILTER]];
            this.logger.debug(`IMAP search all FROM ${this.SENDER_FILTER} (first sync)`);
          }

          imap.search(searchCriteria, async (searchErr, results) => {
            if (searchErr) {
              this.logger.error(`Search failed: ${searchErr.message}`);
              imap.end();
              return reject(new InternalServerErrorException(`Search failed: ${searchErr.message}`));
            }

            if (!results || results.length === 0) {
              imap.end();
              const existingEmails = await this.findAll();
              return resolve({
                success: true,
                data: existingEmails,
                total: existingEmails.length,
                newEmails: 0,
                message: 'No new emails to fetch',
              });
            }

            // Filter out any UIDs that might already exist (safety check)
            const newUids = maxUid ? results.filter(uid => uid > maxUid) : results;

            this.logger.debug(`IMAP search matched ${results.length} uid(s), ${newUids.length} new`);

            if (newUids.length === 0) {
              imap.end();
              const existingEmails = await this.findAll();
              return resolve({
                success: true,
                data: existingEmails,
                total: existingEmails.length,
                newEmails: 0,
                message: 'No new emails to fetch',
              });
            }

            this.logger.debug(`IMAP fetching ${newUids.length} message(s)`);

            // Fetch full email details for ALL new UIDs (no limit)
            const fetchedEmails: ISupportEmail[] = [];
            let processedCount = 0;

            const fetch = imap.fetch(newUids, {
              bodies: '',
              struct: true,
            });

            fetch.on('message', (msg) => {
              let rawEmail = '';
              let uid = 0;

              msg.on('body', (stream) => {
                stream.on('data', (chunk) => {
                  rawEmail += chunk.toString('utf8');
                });
              });

              msg.once('attributes', (attrs) => {
                uid = attrs.uid;
              });

              msg.once('end', async () => {
                try {
                  const parsed = await simpleParser(rawEmail);
                  const savedEmail = await this.saveEmailToDb(uid, parsed);
                  if (savedEmail) {
                    fetchedEmails.push(savedEmail);
                  }
                  processedCount++;

                  if (processedCount === newUids.length) {
                    imap.end();
                    const allEmails = await this.findAll();
                    const result = {
                      success: true,
                      data: allEmails,
                      total: allEmails.length,
                      newEmails: fetchedEmails.length,
                      message: `Fetched and stored ${fetchedEmails.length} new emails`,
                    };

                    // Emit SSE event if new emails were found and emitSSE is true
                    if (emitSSE && fetchedEmails.length > 0) {
                      try {
                        this.sseService.emitSupportEmailFetched(fetchedEmails.length, fetchedEmails);
                        this.logger.debug(`SSE support-email-fetched emitted (${fetchedEmails.length})`);
                      } catch (sseError: any) {
                        // Don't fail the fetch if SSE fails
                        this.logger.warn(`⚠️ Failed to emit SSE event: ${sseError.message}`);
                      }
                    }

                    resolve(result);
                  }
                } catch (parseErr) {
                  this.logger.error(`Failed to parse email UID ${uid}: ${parseErr.message}`);
                  processedCount++;
                }
              });
            });

            fetch.once('error', (fetchErr) => {
              this.logger.error(`Fetch error: ${fetchErr.message}`);
              imap.end();
              reject(new InternalServerErrorException(`Fetch error: ${fetchErr.message}`));
            });
          });
        });
      });

      imap.once('error', (err) => {
        this.logger.error(`IMAP connection error: ${err.message}`);
        reject(new InternalServerErrorException(`IMAP connection error: ${err.message}`));
      });

      imap.connect();
    });
  }

  /**
   * Get the highest UID from database (including deleted emails)
   * This ensures we don't re-fetch emails that were deleted
   */
  private async getMaxUidFromDb(): Promise<number | null> {
    const result = await this.supportEmailRepository
      .createQueryBuilder('email')
      .select('MAX(email.uid)', 'maxUid')
      .getRawOne();

    return result?.maxUid || null;
  }

  /**
   * Save parsed email to database
   * If email with same UID exists (even if soft-deleted), restore it instead of creating duplicate
   */
  private async saveEmailToDb(uid: number, parsed: ParsedMail): Promise<ISupportEmail | null> {
    try {
      // Check if email with this UID already exists (including soft-deleted)
      const existingEmail = await this.supportEmailRepository.findOne({ 
        where: { uid } 
      });

      // Extract addresses
      const fromAddr = parsed.from?.value?.[0];
      const toAddrs = this.extractAddresses(parsed.to);

      const emailData = {
        uid,
        messageId: parsed.messageId?.replace(/[<>]/g, '') || null,
        fromEmail: fromAddr?.address || this.SENDER_FILTER,
        fromName: fromAddr?.name || fromAddr?.address || null,
        toEmails: toAddrs,
        subject: parsed.subject || null,
        emailDate: parsed.date || new Date(),
        bodyText: parsed.text || null,
        bodyHtml: typeof parsed.html === 'string' ? parsed.html : null,
        isRead: existingEmail?.isRead || false, // Preserve read status if restoring
        isDeleted: false, // Restore soft-deleted email
      };

      if (existingEmail) {
        // Email exists - check if it was soft-deleted before updating
        const wasSoftDeleted = existingEmail.isDeleted === true;
        
        // Update it (restore if soft-deleted, or update if not deleted)
        Object.assign(existingEmail, emailData);
        const saved = await this.supportEmailRepository.save(existingEmail);
        
        if (wasSoftDeleted) {
          this.logger.debug(`Restored soft-deleted email UID ${uid}: ${emailData.subject}`);
        } else {
          this.logger.debug(`Updated existing email UID ${uid}: ${emailData.subject}`);
        }
        return this.mapToResponse(saved);
      } else {
        // New email - create it
        const entity = this.supportEmailRepository.create(emailData);
        const saved = await this.supportEmailRepository.save(entity);
        
        this.logger.debug(`Saved new email UID ${uid}: ${emailData.subject}`);
        return this.mapToResponse(saved);
      }
    } catch (error) {
      this.logger.error(`Failed to save email UID ${uid}: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract email addresses from parsed address field
   */
  private extractAddresses(addressField: AddressObject | AddressObject[] | undefined): string[] {
    if (!addressField) return [];
    if (Array.isArray(addressField)) {
      return addressField.flatMap(ao => ao.value.map(addr => addr.address || ''));
    }
    return addressField.value.map(addr => addr.address || '');
  }

  /**
   * Get all stored emails (excluding soft-deleted)
   */
  async findAll(): Promise<ISupportEmail[]> {
    const emails = await this.supportEmailRepository.find({
      where: { isDeleted: false },
      order: { emailDate: 'DESC' },
    });
    return emails.map(e => this.mapToResponse(e));
  }

  /**
   * Get single email by ID (excluding soft-deleted)
   */
  async findOne(id: string): Promise<ISupportEmail> {
    const email = await this.supportEmailRepository.findOne({ 
      where: { id, isDeleted: false } 
    });
    
    if (!email) {
      throw new NotFoundException(`Support email with ID ${id} not found`);
    }
    
    return this.mapToResponse(email);
  }

  /**
   * Get single email by UID (excluding soft-deleted)
   */
  async findByUid(uid: number): Promise<ISupportEmail | null> {
    const email = await this.supportEmailRepository.findOne({ 
      where: { uid, isDeleted: false } 
    });
    return email ? this.mapToResponse(email) : null;
  }

  /**
   * Mark email as read (excluding soft-deleted)
   */
  async markAsRead(id: string): Promise<ISupportEmail> {
    const email = await this.supportEmailRepository.findOne({ 
      where: { id, isDeleted: false } 
    });
    
    if (!email) {
      throw new NotFoundException(`Support email with ID ${id} not found`);
    }

    if (!email.isRead) {
      email.isRead = true;
      await this.supportEmailRepository.save(email);
    }

    return this.mapToResponse(email);
  }

  /**
   * Search emails globally across all fields (subject, fromEmail, fromName, bodyText, bodyHtml, toEmails)
   * Excludes soft-deleted emails
   */
  async searchBySubject(searchTerm: string): Promise<ISupportEmail[]> {
    if (!searchTerm || searchTerm.trim() === '') {
      return this.findAll();
    }

    const searchPattern = `%${searchTerm.trim()}%`;

    const emails = await this.supportEmailRepository
      .createQueryBuilder('email')
      .where(
        '(LOWER(COALESCE(email.subject, \'\')) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(email.fromEmail) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(COALESCE(email.fromName, \'\')) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(COALESCE(email.bodyText, \'\')) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(COALESCE(email.bodyHtml, \'\')) LIKE LOWER(:searchTerm) OR ' +
        'LOWER(COALESCE(email.toEmails, \'\')) LIKE LOWER(:searchTerm)) AND ' +
        'email.isDeleted = false',
        { searchTerm: searchPattern }
      )
      .orderBy('email.emailDate', 'DESC')
      .getMany();

    return emails.map(e => this.mapToResponse(e));
  }

  /**
   * Soft delete email (set isDeleted to true instead of actually deleting)
   */
  async remove(id: string): Promise<{ message: string }> {
    const email = await this.supportEmailRepository.findOne({ 
      where: { id, isDeleted: false } 
    });
    
    if (!email) {
      throw new NotFoundException(`Support email with ID ${id} not found`);
    }

    // Soft delete: set isDeleted to true
    email.isDeleted = true;
    await this.supportEmailRepository.save(email);
    
    this.logger.log(`📧 Soft deleted support email: ${id} (UID: ${email.uid})`);
    return { message: 'Support email deleted successfully' };
  }

  /**
   * Map entity to response
   */
  private mapToResponse(email: SupportEmail): ISupportEmail {
    return {
      id: email.id,
      uid: email.uid,
      messageId: email.messageId,
      fromEmail: email.fromEmail,
      fromName: email.fromName,
      toEmails: email.toEmails || [],
      subject: email.subject,
      emailDate: email.emailDate,
      bodyText: email.bodyText,
      bodyHtml: email.bodyHtml,
      isRead: email.isRead,
      createdAt: email.createdAt,
      updatedAt: email.updatedAt,
    };
  }
}

