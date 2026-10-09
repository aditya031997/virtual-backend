import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  SESClient,
  SendEmailCommand,
  SendRawEmailCommand,
  type SendEmailCommandOutput,
  type SendRawEmailCommandOutput,
} from '@aws-sdk/client-ses';
import type {
  IAppointmentEmailData,
  IEmailParams,
  IEmailResult,
  IEscalationEmailData,
  IReturnRequestEmailData,
} from '@/types';
import {
  generateAppointmentEmailHtml,
  generateAppointmentEmailText,
  generateEscalationEmailHtml,
  generateEscalationEmailText,
  generateReturnRequestEmailHtml,
  generateReturnRequestEmailText,
  generateReturnRequestConfirmationHtml,
  generateReturnRequestConfirmationText,
  generateDepartmentCallbackEmailHtml,
  generateDepartmentCallbackEmailText,
  type IDepartmentCallbackEmailData,
} from '@/helper/email-templates';
import { sanitizeAlternateCallbackNumberInput } from '@/helper/callbackNumberSanitize';

@Injectable()
export class EmailService {
  private readonly sesClient: SESClient;
  private readonly fromEmail: string;
  private readonly supportEmail: string;
  // Dedicated inboxes for chatbot appointment + return emails (fall back to the
  // support inbox if unset) so each flow can be routed/ingested independently.
  private readonly appointmentEmail: string;
  private readonly returnEmail: string;
  private readonly logger = new Logger(EmailService.name);
  private static warnedImapSyncUrlFallback = false;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('REGION');
    const accessKey = this.configService.get<string>('ACCESS_KEY');
    const secretKey = this.configService.get<string>('SECRET_ACCESS_KEY');

    // Get email configuration
    this.fromEmail =
      this.configService.get<string>('SES_FROM_EMAIL') || 'sender@example.com';
    this.supportEmail =
      this.configService.get<string>('SES_SUPPORT_EMAIL') ||
      'support@example.com';
    this.appointmentEmail =
      this.configService.get<string>('SES_APPOINTMENT_EMAIL') ||
      this.supportEmail;
    this.returnEmail =
      this.configService.get<string>('SES_RETURN_EMAIL') || this.supportEmail;

    if (!region || !accessKey || !secretKey) {
      this.logger.warn(
        'Missing AWS SES configuration. Email service will not be available.',
      );
      return;
    }

    this.sesClient = new SESClient({
      region: region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });

    this.logger.log(`Email Service initialized with region: ${region}`);
  }

  /**
   * Sanitize and validate email address
   */
  private sanitizeEmail(email: string | null | undefined): string | null {
    if (!email) {
      return null;
    }

    // Convert to string and trim whitespace
    const sanitized = String(email).trim();

    // Check if it's a valid email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!sanitized || !emailRegex.test(sanitized)) {
      this.logger.warn(`Invalid email format: "${email}"`);
      return null;
    }

    // Check for control characters or invalid whitespace
    if (/[\x00-\x1F\x7F\s]/.test(sanitized)) {
      this.logger.warn(
        `Email contains control characters or whitespace: "${email}"`,
      );
      return null;
    }

    return sanitized;
  }

  /**
   * Sanitize array of email addresses
   */
  private sanitizeEmailArray(emails: string | string[]): string[] {
    const emailArray = Array.isArray(emails) ? emails : [emails];

    return emailArray
      .map((email) => this.sanitizeEmail(email))
      .filter((email): email is string => email !== null);
  }

  /**
   * Send email using AWS SES
   */
  async sendEmail(params: IEmailParams): Promise<IEmailResult> {
    try {
      if (!this.sesClient) {
        this.logger.error('SES client not initialized. Cannot send email.');
        return {
          success: false,
          error: 'Email service not configured',
        };
      }

      // Sanitize all email addresses
      const toAddresses = this.sanitizeEmailArray(params.to);
      const fromAddress = this.sanitizeEmail(params.from || this.fromEmail);
      const replyToAddress = params.replyTo
        ? this.sanitizeEmail(params.replyTo)
        : null;

      // Validate we have valid addresses
      if (toAddresses.length === 0) {
        this.logger.error('No valid recipient email addresses provided');
        return {
          success: false,
          error: 'No valid recipient email addresses',
        };
      }

      if (!fromAddress) {
        this.logger.error('No valid from email address');
        return {
          success: false,
          error: 'No valid from email address',
        };
      }

      this.logger.log(
        `Sending email from: ${fromAddress} to: ${toAddresses.join(', ')}`,
      );

      const command = new SendEmailCommand({
        Source: fromAddress,
        Destination: {
          ToAddresses: toAddresses,
        },
        Message: {
          Subject: {
            Data: params.subject,
            Charset: 'UTF-8',
          },
          Body: {
            ...(params.body.text && {
              Text: {
                Data: params.body.text,
                Charset: 'UTF-8',
              },
            }),
            ...(params.body.html && {
              Html: {
                Data: params.body.html,
                Charset: 'UTF-8',
              },
            }),
          },
        },
        ...(replyToAddress && {
          ReplyToAddresses: [replyToAddress],
        }),
      });

      const response = await this.sesClient.send(command);

      this.logger.log(
        `Email sent successfully. MessageId: ${response.MessageId}`,
      );

      return {
        success: true,
        messageId: response.MessageId,
      };
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send escalation email when no human agent picks up
   */
  async sendEscalationEmail(data: IEscalationEmailData): Promise<IEmailResult> {
    // Validate caller email before using it
    const sanitizedCallerEmail = data.callerEmail
      ? this.sanitizeEmail(data.callerEmail)
      : null;

    if (data.callerEmail && !sanitizedCallerEmail) {
      this.logger.warn(
        `Caller email "${data.callerEmail}" is invalid and will be excluded from escalation email`,
      );
    }

    // Prepare data with sanitized email
    const emailData: IEscalationEmailData = {
      ...data,
      callerEmail: sanitizedCallerEmail || data.callerEmail,
    };

    const subject = `Callback Request - ${data.callerName || 'Unknown Caller'}`;
    const htmlBody = generateEscalationEmailHtml(emailData);
    const textBody = generateEscalationEmailText(emailData);

    const result = await this.sendEmail({
      to: this.supportEmail,
      subject,
      body: {
        html: htmlBody,
        text: textBody,
      },
      replyTo: sanitizedCallerEmail || undefined,
    });

    if (result.success) {
      // Fire-and-forget: the IMAP sync retries for up to ~50s, so never block
      // the caller (the ElevenLabs tool times out ~20s) — run it in background.
      void this.triggerSupportEmailImapFetch().catch((err) =>
        this.logger.warn(
          `[IMAP_SYNC] background trigger failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    return result;
  }

  /**
   * Send an appointment request email to the support inbox
   * (SES_SUPPORT_EMAIL) when a customer books via the chatbot widget.
   */
  async sendAppointmentRequestEmail(
    data: IAppointmentEmailData,
  ): Promise<IEmailResult> {
    const sanitizedCustomerEmail = this.sanitizeEmail(data.customerEmail);

    const emailData: IAppointmentEmailData = {
      ...data,
      customerEmail: sanitizedCustomerEmail || data.customerEmail,
    };

    const subject = `Appointment Request - ${data.customerName || 'Unknown Customer'}`;

    const result = await this.sendEmail({
      to: this.appointmentEmail,
      subject,
      body: {
        html: generateAppointmentEmailHtml(emailData),
        text: generateAppointmentEmailText(emailData),
      },
      replyTo: sanitizedCustomerEmail || undefined,
    });

    if (result.success) {
      // Fire-and-forget: the IMAP sync retries for up to ~50s, so never block
      // the caller (the ElevenLabs tool times out ~20s) — run it in background.
      void this.triggerSupportEmailImapFetch().catch((err) =>
        this.logger.warn(
          `[IMAP_SYNC] background trigger failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    return result;
  }

  /**
   * Send a return / RMA request email to the support inbox
   * (SES_SUPPORT_EMAIL) when a customer submits a return via the chatbot.
   */
  async sendReturnRequestEmail(
    data: IReturnRequestEmailData,
  ): Promise<IEmailResult> {
    const sanitizedCustomerEmail = this.sanitizeEmail(data.customerEmail);

    const emailData: IReturnRequestEmailData = {
      ...data,
      customerEmail: sanitizedCustomerEmail || data.customerEmail,
    };

    // All return / RMA requests are routed to the dedicated return inbox
    // (SES_RETURN_EMAIL → support@yopmail.com). The department the user picked
    // is still surfaced in the subject prefix so the recipient can triage it.
    const recipient = this.returnEmail;

    const orderSuffix = data.orderId ? ` (Order ${data.orderId})` : '';
    const deptPrefix = data.departmentType
      ? `[${data.departmentType.toUpperCase()}] `
      : '';
    const subject = `${deptPrefix}Return / RMA Request - ${data.customerName || 'Unknown Customer'}${orderSuffix}`;

    const result = await this.sendEmail({
      to: recipient,
      subject,
      body: {
        html: generateReturnRequestEmailHtml(emailData),
        text: generateReturnRequestEmailText(emailData),
      },
      replyTo: sanitizedCustomerEmail || undefined,
    });

    if (result.success) {
      // Fire-and-forget: the IMAP sync retries for up to ~50s, so never block
      // the caller (the ElevenLabs tool times out ~20s) — run it in background.
      void this.triggerSupportEmailImapFetch().catch((err) =>
        this.logger.warn(
          `[IMAP_SYNC] background trigger failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    return result;
  }

  /**
   * Send a confirmation email to the CUSTOMER who raised the return (different
   * template from the support notification). Returns a failed result without
   * attempting a send if the customer email is missing/invalid, so the caller
   * can treat it as best-effort.
   */
  async sendReturnRequestConfirmationEmail(
    data: IReturnRequestEmailData,
  ): Promise<IEmailResult> {
    const sanitizedCustomerEmail = this.sanitizeEmail(data.customerEmail);
    if (!sanitizedCustomerEmail) {
      this.logger.warn(
        `Skipping return confirmation email — invalid customer email: "${data.customerEmail}"`,
      );
      return { success: false, error: 'Invalid customer email' };
    }

    const subject = 'We’ve received your return request';

    return this.sendEmail({
      to: sanitizedCustomerEmail,
      subject,
      body: {
        html: generateReturnRequestConfirmationHtml(data),
        text: generateReturnRequestConfirmationText(data),
      },
      // Replies from the customer should reach the support inbox.
      replyTo: this.supportEmail,
    });
  }

  /**
   * Send a business-hours department callback to the chosen department inbox
   * (Sales/Service/Account) AND a confirmation to the user. Reuses the
   * escalation template for the internal email.
   */
  async sendDepartmentCallbackEmail(data: {
    department: string;
    callerName: string;
    callerEmail: string;
    callerPhone: string;
    callbackNumber?: string;
    concern?: string;
  }): Promise<IEmailResult> {
    const recipient = this.resolveDepartmentEmail(data.department);
    const sanitizedCallerEmail = this.sanitizeEmail(data.callerEmail);
    const deptLabel = data.department.trim().toUpperCase();

    const callbackData: IDepartmentCallbackEmailData = {
      department: data.department,
      callerName: data.callerName,
      callerEmail: sanitizedCallerEmail || data.callerEmail,
      callerPhone: data.callerPhone,
      callbackNumber: data.callbackNumber,
      concern: data.concern,
    };

    const result = await this.sendEmail({
      to: recipient,
      subject: `[${deptLabel}] Callback Request - ${data.callerName || 'Unknown Caller'}`,
      body: {
        html: generateDepartmentCallbackEmailHtml(callbackData),
        text: generateDepartmentCallbackEmailText(callbackData),
      },
      replyTo: sanitizedCallerEmail || undefined,
    });

    if (sanitizedCallerEmail) {
      await this.sendEmail({
        to: sanitizedCallerEmail,
        subject: 'We’ve received your callback request',
        body: {
          html: generateDepartmentCallbackEmailHtml(callbackData),
          text: generateDepartmentCallbackEmailText(callbackData),
        },
        replyTo: this.supportEmail,
      });
    }

    if (result.success) {
      // Fire-and-forget: the IMAP sync retries for up to ~50s, so never block
      // the caller (the ElevenLabs tool times out ~20s) — run it in background.
      void this.triggerSupportEmailImapFetch().catch((err) =>
        this.logger.warn(
          `[IMAP_SYNC] background trigger failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    return result;
  }

  /**
   * Resolve a department's inbox from env (DEPT_SALES_EMAIL / DEPT_SERVICE_EMAIL
   * / DEPT_ACCOUNT_EMAIL / DEPT_SUPPORT_EMAIL). Falls back to SES_SUPPORT_EMAIL
   * if the specific department isn't configured, so a request is never lost.
   */
  private resolveDepartmentEmail(department: string): string {
    const key = (department || '').trim().toLowerCase();
    const map: Record<string, string | undefined> = {
      sales: this.configService.get<string>('DEPT_SALES_EMAIL'),
      service: this.configService.get<string>('DEPT_SERVICE_EMAIL'),
      account: this.configService.get<string>('DEPT_ACCOUNT_EMAIL'),
      accounts: this.configService.get<string>('DEPT_ACCOUNT_EMAIL'),
      support: this.configService.get<string>('DEPT_SUPPORT_EMAIL'),
    };
    const configured = (map[key] || '').trim();
    if (!configured) {
      this.logger.warn(
        `No DEPT_*_EMAIL configured for department "${department}"; falling back to support inbox.`,
      );
      return this.supportEmail;
    }
    return configured;
  }

  /** Calls GET /api/support-email/fetch after an outbound send; retries until new mail appears or attempts exhausted. */
  private async triggerSupportEmailImapFetch(): Promise<void> {
    let url = '';
    try {
      const { base: apiBase, usedPublicUrl } =
        this.getSupportEmailFetchApiBase();
      if (!usedPublicUrl && !EmailService.warnedImapSyncUrlFallback) {
        EmailService.warnedImapSyncUrlFallback = true;
        this.logger.warn(
          '[IMAP_SYNC] PUBLIC_API_URL and BASE_URL are unset; using loopback for post-send IMAP sync. Set PUBLIC_API_URL (or BASE_URL) on this server.',
        );
      }
      url = `${apiBase}/support-email/fetch`;

      const maxAttempts = Math.max(
        1,
        Number(this.configService.get<string>('IMAP_FETCH_RETRY_ATTEMPTS')) ||
          5,
      );
      const delayMs = Math.max(
        0,
        Number(this.configService.get<string>('IMAP_FETCH_RETRY_DELAY_MS')) ||
          10_000,
      );

      this.logger.log(
        `[IMAP_SYNC] starting IMAP sync via HTTP (maxAttempts=${maxAttempts} delayMs=${delayMs}) url=${url}`,
      );

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const response = await axios.get(url, {
            timeout: 120_000,
            validateStatus: () => true,
          });

          if (response.status >= 200 && response.status < 300) {
            const raw = (response.data as { newEmails?: unknown })?.newEmails;
            const newEmails =
              typeof raw === 'number' && !Number.isNaN(raw) ? raw : Number(raw);

            if (!Number.isNaN(newEmails) && newEmails > 0) {
              this.logger.log(
                `[IMAP_SYNC] fetched from IMAP OK newEmails=${newEmails} (attempt ${attempt}/${maxAttempts})`,
              );
              return;
            }

            if (attempt < maxAttempts && delayMs > 0) {
              await new Promise((r) => setTimeout(r, delayMs));
            }
            continue;
          }

          this.logger.warn(
            `[IMAP_SYNC] support-email/fetch attempt ${attempt}/${maxAttempts} HTTP ${response.status}: ${JSON.stringify(response.data).slice(0, 300)}`,
          );
          if (attempt < maxAttempts && delayMs > 0) {
            await new Promise((r) => setTimeout(r, delayMs));
          }
        } catch (inner: unknown) {
          const msg = inner instanceof Error ? inner.message : String(inner);
          this.logger.warn(
            `[IMAP_SYNC] support-email/fetch attempt ${attempt}/${maxAttempts} failed: ${msg}`,
          );
          if (attempt < maxAttempts && delayMs > 0) {
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }
      }

      this.logger.warn(
        `[IMAP_SYNC] support-email/fetch gave up after ${maxAttempts} attempt(s) with no newEmails>0 (${url})`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[IMAP_SYNC] support-email/fetch unexpected error (${url}): ${msg}`,
      );
    }
  }

  /**
   * Base URL for GET /api/support-email/fetch after escalation send.
   * Prefers PUBLIC_API_URL or BASE_URL; if both missing, uses loopback (same machine / PM2 single process).
   */
  private getSupportEmailFetchApiBase(): {
    base: string;
    usedPublicUrl: boolean;
  } {
    const raw =
      this.configService.get<string>('PUBLIC_API_URL') ||
      this.configService.get<string>('BASE_URL');
    if (raw?.trim()) {
      const b = raw.trim().replace(/\/+$/, '');
      const normalized = b.endsWith('/api') ? b : `${b}/api`;
      return { base: normalized, usedPublicUrl: true };
    }
    const port =
      this.configService.get<string>('PORT') || process.env.PORT || '5000';
    return { base: `http://127.0.0.1:${port}/api`, usedPublicUrl: false };
  }

  /**
   * Get the configured support email
   */
  getSupportEmail(): string {
    return this.supportEmail;
  }

  /**
   * Get the configured from email
   */
  getFromEmail(): string {
    return this.fromEmail;
  }

  async sendKnowledgeBaseSearchEmail(params: {
    to: string;
    userName: string;
    query: string;
    matchedFileName: string;
    matchedDocument: string;
    originalUrl?: string | null;
    referenceUrl?: string | null;
    attachment?: {
      fileName: string;
      content: Buffer;
      contentType: string;
    } | null;
  }): Promise<IEmailResult> {
    try {
      if (!this.sesClient) {
        this.logger.error(
          'SES client not initialized. Cannot send knowledge base search email.',
        );
        return {
          success: false,
          error: 'Email service not configured',
        };
      }

      const toAddress = this.sanitizeEmail(params.to);
      const fromAddress = this.sanitizeEmail(this.fromEmail);

      if (!toAddress) {
        return {
          success: false,
          error: 'No valid recipient email address',
        };
      }

      if (!fromAddress) {
        return {
          success: false,
          error: 'No valid from email address',
        };
      }

      const cleanedTitle = this.formatKnowledgeBaseReferenceTitle(
        params.matchedFileName,
      );
      const subject = `Details Requested - ${cleanedTitle}`;
      const referenceValue =
        params.referenceUrl || params.originalUrl || params.matchedFileName;
      const textBody = this.generateKnowledgeBaseSearchEmailText({
        userName: params.userName,
        title: cleanedTitle,
        query: params.query,
        answer: params.matchedDocument,
        reference: referenceValue,
      });
      const htmlBody = this.generateKnowledgeBaseSearchEmailHtml({
        userName: params.userName,
        title: cleanedTitle,
        query: params.query,
        answer: params.matchedDocument,
        reference: referenceValue,
        referenceUrl: params.referenceUrl || params.originalUrl || null,
      });

      if (!params.attachment) {
        return this.sendEmail({
          to: toAddress,
          subject,
          body: {
            text: textBody,
            html: htmlBody,
          },
          // Replies land in the support inbox instead of bouncing off the
          // noreply From. A valid Reply-To on a "reply to us" email is also a
          // positive deliverability signal (reduces spam scoring).
          replyTo: this.supportEmail,
        });
      }

      const mixedBoundary = `mixed_${Date.now()}`;
      const alternativeBoundary = `alt_${Date.now()}`;
      const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;
      const crlf = '\r\n';
      const encodedTextBody = Buffer.from(textBody, 'utf-8')
        .toString('base64')
        .replace(/(.{76})/g, `$1${crlf}`);
      const encodedHtmlBody = Buffer.from(htmlBody, 'utf-8')
        .toString('base64')
        .replace(/(.{76})/g, `$1${crlf}`);
      const attachmentContent = params.attachment.content
        .toString('base64')
        .replace(/(.{76})/g, `$1${crlf}`);

      // Friendly From display-name ("SmartCaller Support" <noreply@…>) — a named
      // sender is a positive trust signal and matches the non-attachment path.
      const fromHeader = `SmartCaller Support <${fromAddress}>`;
      // Replies reach the support inbox instead of bouncing off the noreply From;
      // a valid Reply-To also lowers spam scoring for a "reply to us" email.
      const replyToHeader = this.sanitizeEmail(this.supportEmail);

      const rawEmail = [
        `From: ${fromHeader}`,
        `To: ${toAddress}`,
        ...(replyToHeader ? [`Reply-To: ${replyToHeader}`] : []),
        `Subject: ${encodedSubject}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
        '',
        `--${mixedBoundary}`,
        `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
        '',
        `--${alternativeBoundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        encodedTextBody,
        '',
        `--${alternativeBoundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        encodedHtmlBody,
        '',
        `--${alternativeBoundary}--`,
        '',
        `--${mixedBoundary}`,
        `Content-Type: ${params.attachment.contentType}; name="${params.attachment.fileName}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${params.attachment.fileName}"`,
        '',
        attachmentContent,
        '',
        `--${mixedBoundary}--`,
      ].join(crlf);

      const command = new SendRawEmailCommand({
        RawMessage: {
          Data: Buffer.from(rawEmail),
        },
      });

      if (Buffer.byteLength(rawEmail, 'utf-8') >= 10 * 1024 * 1024) {
        this.logger.warn(
          `Knowledge base search email exceeded SES size limit with attachment. Falling back to link-only email for ${params.matchedFileName}`,
        );
        return this.sendEmail({
          to: toAddress,
          subject,
          body: {
            text: textBody,
            html: htmlBody,
          },
          replyTo: this.supportEmail,
        });
      }

      const response = await this.sesClient.send(command);

      this.logger.log(
        `Knowledge base search email sent successfully. MessageId: ${response.MessageId}`,
      );

      return {
        success: true,
        messageId: response.MessageId,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send knowledge base search email: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Sends caller details to a human agent who confirmed availability on a SmartCaller outbound call.
   * Uses the SmartCaller-branded email template (matches the knowledge base email style).
   */
  async sendHumanAgentCallerDetailsEmail(params: {
    to: string;
    agentName: string;
    callerName: string;
    callerEmail: string | null;
    callerPhone: string | null;
    callBackNumber: string | null;
    callerQuery: string | null;
    siteName: string | null;
  }): Promise<IEmailResult> {
    const subject = `New customer query from ${params.callerName || 'a customer'} — SmartCaller`;
    const intro = `Thanks for confirming your availability. ${params.callerName || 'A customer'} is waiting to hear from you — their contact details are below.`;
    const text = this.buildBrandedNotificationText({
      greetingName: params.agentName,
      intro,
      callerName: params.callerName,
      callerEmail: params.callerEmail,
      callerPhone: params.callerPhone,
      callBackNumber: params.callBackNumber,
      siteName: params.siteName,
      callerQuery: params.callerQuery,
      closing: 'Warm regards,\nSmartCaller Support Team',
    });
    const html = this.buildBrandedNotificationHtml({
      greetingName: params.agentName,
      intro,
      cardTitle: 'Customer query',
      cardSubtitle: 'Please follow up with the customer',
      callerName: params.callerName,
      callerEmail: params.callerEmail,
      callerPhone: params.callerPhone,
      callBackNumber: params.callBackNumber,
      siteName: params.siteName,
      callerQuery: params.callerQuery,
      closingHtml:
        'If you have any further questions, feel free to reply to this email or give us a call.<br><br>Warm regards,<br><strong style="color:#1f2d3d;">SmartCaller Support Team</strong>',
    });

    return this.sendEmail({
      to: params.to,
      subject,
      body: { text, html },
    });
  }

  /**
   * Sends an alert to a dealer when no human agent in their priority queue picked up.
   * Uses the SmartCaller-branded email template.
   */
  async sendDealerNoAgentsAvailableEmail(params: {
    to: string;
    dealerName: string;
    callerName: string;
    callerEmail: string | null;
    callerPhone: string | null;
    callBackNumber: string | null;
    callerQuery: string | null;
    siteName: string | null;
  }): Promise<IEmailResult> {
    const subject = 'Customer callback request — no technician was available';
    const intro =
      'A customer called in after hours and wanted to talk with our support team, but none of the support team was available at that moment.';
    const text = this.buildBrandedNotificationText({
      greetingName: params.dealerName,
      intro,
      callerName: params.callerName,
      callerEmail: params.callerEmail,
      callerPhone: params.callerPhone,
      callBackNumber: params.callBackNumber,
      siteName: params.siteName,
      callerQuery: params.callerQuery,
      closing: 'Please reach out to the customer directly.\n\n— SmartCaller',
    });
    const html = this.buildBrandedNotificationHtml({
      greetingName: params.dealerName,
      intro,
      cardTitle: 'Customer details',
      cardSubtitle: 'After-hours callback request',
      callerName: params.callerName,
      callerEmail: params.callerEmail,
      callerPhone: params.callerPhone,
      callBackNumber: params.callBackNumber,
      siteName: params.siteName,
      callerQuery: params.callerQuery,
      closingHtml:
        'Please reach out to the customer directly.<br><br>Warm regards,<br><strong style="color:#1f2d3d;">SmartCaller Support Team</strong>',
    });

    return this.sendEmail({
      to: params.to,
      subject,
      body: { text, html },
    });
  }

  private buildBrandedNotificationText(d: {
    greetingName: string;
    intro: string;
    callerName: string;
    callerEmail: string | null;
    callerPhone: string | null;
    callBackNumber: string | null;
    siteName: string | null;
    callerQuery: string | null;
    closing: string;
  }): string {
    const hasQuery =
      typeof d.callerQuery === 'string' && d.callerQuery.trim().length > 0;
    const callBack = sanitizeAlternateCallbackNumberInput(d.callBackNumber);
    const hasCallBack = callBack !== null;
    const lines: string[] = [
      `Hi ${d.greetingName || 'there'},`,
      ``,
      d.intro,
      ``,
      `Caller details:`,
      `  Name:             ${d.callerName || '—'}`,
      `  Email:            ${d.callerEmail || '—'}`,
      `  Phone:            ${d.callerPhone || '—'}`,
    ];
    if (hasCallBack) {
      lines.push(`  callBack_number:  ${callBack}`);
    }
    lines.push(`  Site:             ${d.siteName || '—'}`);
    if (hasQuery) {
      lines.push(``, `Query:`, d.callerQuery as string);
    }
    lines.push(``, d.closing);
    return lines.join('\n');
  }

  private buildBrandedNotificationHtml(d: {
    greetingName: string;
    intro: string;
    cardTitle: string;
    cardSubtitle: string;
    callerName: string;
    callerEmail: string | null;
    callerPhone: string | null;
    callBackNumber: string | null;
    siteName: string | null;
    callerQuery: string | null;
    closingHtml: string;
  }): string {
    const esc = (v: string | null | undefined): string =>
      this.escapeHtml(((v ?? '') + '').trim() || '—');
    const escName = this.escapeHtml((d.greetingName || 'there').trim());
    const escIntro = this.escapeHtml(d.intro);
    const escCardTitle = this.escapeHtml(d.cardTitle);
    const escCardSubtitle = this.escapeHtml(d.cardSubtitle);
    const hasQuery =
      typeof d.callerQuery === 'string' && d.callerQuery.trim().length > 0;
    const callBack = sanitizeAlternateCallbackNumberInput(d.callBackNumber);
    const hasCallBack = callBack !== null;
    const queryHtml = hasQuery
      ? this.escapeHtml(d.callerQuery as string).replace(/\r?\n/g, '<br>')
      : '';

    const brandImgHtml = this.getSmartCallerLogoImgTagRemoteUrlOnly();
    const showSmartCallerWordmark = !brandImgHtml;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#333333;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f7fa;margin:0;padding:0;width:100%;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-collapse:collapse;">
          <tr>
            <td align="center" style="background-color:#0aa6d4;padding:24px 20px;">
              ${brandImgHtml}
              ${
                showSmartCallerWordmark
                  ? `<div style="margin:0;font-size:22px;line-height:28px;font-weight:700;color:#ffffff;">SmartCaller</div>`
                  : ''
              }
              <div style="margin-top:${showSmartCallerWordmark ? '6' : '4'}px;font-size:13px;line-height:20px;color:#dff6fc;">Virtual Receptionist Team</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 14px 28px;font-size:15px;line-height:28px;color:#2c3e50;">
              Hi ${escName},<br><br>
              ${escIntro}
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 24px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border:1px solid #b9dfeb;background-color:#ffffff;">
                <tr>
                  <td style="padding:18px;background-color:#eef9fd;border-bottom:1px solid #b9dfeb;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" style="width:44px;">
                          <div style="width:36px;height:36px;line-height:36px;text-align:center;background-color:#0aa6d4;color:#ffffff;font-size:18px;font-weight:700;border-radius:8px;">+</div>
                        </td>
                        <td valign="top" style="padding-left:12px;">
                          <div style="margin:0;font-size:14px;line-height:20px;font-weight:600;color:#0a8fbc;">${escCardSubtitle}</div>
                          <div style="margin-top:6px;font-size:20px;line-height:28px;font-weight:700;color:#1f2d3d;">${escCardTitle}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px;font-size:15px;line-height:24px;color:#34495e;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td style="padding:6px 10px;background:#f7fbfd;font-weight:600;color:#1f2d3d;width:30%;border:1px solid #e7f3f8;">Name</td>
                        <td style="padding:6px 10px;border:1px solid #e7f3f8;">${esc(d.callerName)}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 10px;background:#f7fbfd;font-weight:600;color:#1f2d3d;border:1px solid #e7f3f8;">Email</td>
                        <td style="padding:6px 10px;border:1px solid #e7f3f8;">${esc(d.callerEmail)}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 10px;background:#f7fbfd;font-weight:600;color:#1f2d3d;border:1px solid #e7f3f8;">Phone</td>
                        <td style="padding:6px 10px;border:1px solid #e7f3f8;">${esc(d.callerPhone)}</td>
                      </tr>
                      ${
                        hasCallBack
                          ? `<tr>
                        <td style="padding:6px 10px;background:#f7fbfd;font-weight:600;color:#1f2d3d;border:1px solid #e7f3f8;">callBack_number</td>
                        <td style="padding:6px 10px;border:1px solid #e7f3f8;">${esc(callBack)}</td>
                      </tr>`
                          : ''
                      }
                      <tr>
                        <td style="padding:6px 10px;background:#f7fbfd;font-weight:600;color:#1f2d3d;border:1px solid #e7f3f8;">Site</td>
                        <td style="padding:6px 10px;border:1px solid #e7f3f8;">${esc(d.siteName)}</td>
                      </tr>
                    </table>
                    ${
                      hasQuery
                        ? `<div style="margin-top:14px;font-size:14px;line-height:22px;color:#34495e;">
                      <div style="font-weight:600;color:#1f2d3d;margin-bottom:4px;">Query</div>
                      <div style="word-break:break-word;">${queryHtml}</div>
                    </div>`
                        : ''
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px 28px;font-size:15px;line-height:28px;color:#6b7f92;">
              ${d.closingHtml}
            </td>
          </tr>
          <tr>
            <td align="center" style="background-color:#eef9fd;padding:16px 20px;border-top:1px solid #d7eef7;">
              <div style="margin:0;font-size:12px;line-height:18px;color:#8ea9ba;">© ${new Date().getFullYear()} SmartCaller</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  /**
   * Default KB email header logo — final S3 object (ap-southeast-2):
   * `s3://virtual-receptionist-bucket/documents/smartCaller.png`
   * Override with env `SMARTCALLER_LOGO_URL` if needed.
   */
  private static readonly DEFAULT_SMARTCALLER_LOGO_URL =
    'https://virtual-receptionist-bucket.s3.ap-southeast-2.amazonaws.com/documents/smartCaller.png';

  /**
   * Logo in KB email HTML via public HTTPS `<img>` only (no MIME inline — avoids extra Gmail attachments).
   * Uses `SMARTCALLER_LOGO_URL` when set; otherwise the default S3 object URL on this class.
   */
  private getSmartCallerLogoImgTagRemoteUrlOnly(): string {
    const raw =
      this.configService.get<string>('SMARTCALLER_LOGO_URL')?.trim() ||
      EmailService.DEFAULT_SMARTCALLER_LOGO_URL;
    if (!raw || !/^https:\/\//i.test(raw)) {
      return '';
    }
    const src = this.escapeHtml(raw);
    return `<img src="${src}" alt="" width="220" role="presentation" style="display:block;margin:0 auto 8px;max-width:280px;height:auto;border:0;outline:none;text-decoration:none;" />`;
  }

  private generateKnowledgeBaseSearchEmailHtml(data: {
    userName: string;
    title: string;
    query: string;
    answer: string;
    reference: string;
    referenceUrl?: string | null;
  }): string {
    const escapedUserName = this.escapeHtml(data.userName.trim());
    const escapedTitle = this.escapeHtml(data.title);
    const escapedQuery = this.escapeHtml(data.query);
    const escapedAnswer = this.escapeHtml(data.answer);
    const answerHtml = escapedAnswer.replace(/\r?\n/g, '<br>');
    const linkLabel = data.referenceUrl
      ? this.formatReferenceDisplayValue(data.referenceUrl, data.reference)
      : data.reference;
    const referenceHtml = data.referenceUrl
      ? `<a href="${this.escapeHtml(data.referenceUrl)}" style="color:#0a8fbc;text-decoration:none;font-size:14px;line-height:20px;font-weight:600;">${this.escapeHtml(linkLabel)}</a>`
      : this.escapeHtml(linkLabel);

    const brandImgHtml = this.getSmartCallerLogoImgTagRemoteUrlOnly();
    const showSmartCallerWordmark = !brandImgHtml;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#333333;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f7fa;margin:0;padding:0;width:100%;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-collapse:collapse;">
          <tr>
            <td align="center" style="background-color:#0aa6d4;padding:24px 20px;">
              ${brandImgHtml}
              ${
                showSmartCallerWordmark
                  ? `<div style="margin:0;font-size:22px;line-height:28px;font-weight:700;color:#ffffff;">SmartCaller</div>`
                  : ''
              }
              <div style="margin-top:${showSmartCallerWordmark ? '6' : '4'}px;font-size:13px;line-height:20px;color:#dff6fc;">Virtual Receptionist Team</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 18px 28px;font-size:15px;line-height:28px;color:#2c3e50;">
              Hi ${escapedUserName},<br><br>
              Thank you for reaching out to us. As requested during your enquiry, please find the product details below.
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 24px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border:1px solid #b9dfeb;background-color:#ffffff;">
                <tr>
                  <td style="padding:18px;background-color:#eef9fd;border-bottom:1px solid #b9dfeb;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" style="width:44px;">
                          <div style="width:36px;height:36px;line-height:36px;text-align:center;background-color:#0aa6d4;color:#ffffff;font-size:18px;font-weight:700;border-radius:8px;">+</div>
                        </td>
                        <td valign="top" style="padding-left:12px;">
                          <div style="margin:0;font-size:14px;line-height:20px;font-weight:600;color:#0a8fbc;">${escapedQuery}</div>
                          <div style="margin-top:6px;font-size:20px;line-height:28px;font-weight:700;color:#1f2d3d;">${escapedTitle}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 18px 14px 18px;font-size:15px;line-height:26px;color:#34495e;word-break:break-word;">
                    ${answerHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 18px 18px 18px;">
                    <div style="border-top:1px solid #e7f3f8;padding-top:14px;font-size:14px;line-height:22px;color:#34495e;word-break:break-word;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td valign="middle" style="padding-right:8px;font-size:14px;line-height:20px;color:#0a8fbc;">&#128279;</td>
                          <td valign="middle">${referenceHtml}</td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px 28px;font-size:15px;line-height:28px;color:#6b7f92;">
              If you have any further questions, feel free to reply to this email or give us a call.<br><br>
              Warm regards,<br>
              <strong style="color:#1f2d3d;">SmartCaller Support Team</strong>
            </td>
          </tr>
          <tr>
            <td align="center" style="background-color:#eef9fd;padding:16px 20px;border-top:1px solid #d7eef7;border-bottom-left-radius:12px;border-bottom-right-radius:12px;">
              <div style="margin:0;font-size:12px;line-height:18px;color:#8ea9ba;">© ${new Date().getFullYear()} SmartCaller</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  private generateKnowledgeBaseSearchEmailText(data: {
    userName: string;
    title: string;
    query: string;
    answer: string;
    reference: string;
  }): string {
    return `
SMARTCALLER
Virtual Receptionist Team

Hi ${data.userName},

Thank you for reaching out to us. As requested during your enquiry, please find the product details below.

${data.title}
${data.query}

DETAILS
-------
${data.answer}

REFERENCE
---------
Reference: ${data.reference}

This is an automated message from SmartCaller AI.
    `.trim();
  }

  private formatKnowledgeBaseReferenceTitle(fileName: string): string {
    return fileName
      .replace(/__[A-Za-z0-9_-]+(?=\.[^.]+$|$)/, '')
      .replace(/\.[^.]+$/, '')
      .trim();
  }

  private formatReferenceDisplayValue(
    referenceUrl: string,
    fallback: string,
  ): string {
    try {
      const parsedUrl = new URL(referenceUrl);
      const isSignedS3Url =
        parsedUrl.hostname.includes('amazonaws.com') &&
        parsedUrl.pathname.includes('/documents/original-sources/');

      if (isSignedS3Url) {
        const decodedPath = decodeURIComponent(parsedUrl.pathname || '');
        const fileName = decodedPath.split('/').pop() || fallback;
        return fileName.replace(/__[A-Za-z0-9_-]+(?=\.[^.]+$|$)/, '');
      }

      const decodedPath = decodeURIComponent(parsedUrl.pathname || '').replace(
        /\/$/,
        '',
      );
      return `${parsedUrl.host}${decodedPath}`;
    } catch {
      return fallback;
    }
  }
}
