import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { DateTime } from 'luxon';
import type { AuditLogCategory, AuditLogPayload } from '@/auditLog/auditLog.types';

const CATEGORY_FILE: Record<AuditLogCategory, string> = {
  'parent-company': 'parent-company.log',
  dealer: 'dealer.log',
  site: 'site.log',
  'human-agent': 'human-agent.log',
  'business-hours': 'business-hours.log',
  'after-hours': 'after-hours.log',
  'public-holiday': 'public-holiday.log',
  'api-getBySiteName': 'api-getBySiteName.log',
  'api-search-email': 'api-search-email.log',
  'api-transfer-query': 'api-transfer-query.log',
  'api-current-day': 'api-current-day.log',
};

const DEFAULT_BUSINESS_TIMEZONE = 'Australia/Melbourne';
const SEPARATOR = '---------------------------------------';

@Injectable()
export class AuditFileLoggerService implements OnModuleInit {
  private readonly logger = new Logger(AuditFileLoggerService.name);
  private logDir = path.join(process.cwd(), 'logs');
  private timezone = DEFAULT_BUSINESS_TIMEZONE;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const configuredDir = this.configService.get<string>('AUDIT_LOG_DIR');
    if (configuredDir?.trim()) {
      this.logDir = path.isAbsolute(configuredDir)
        ? configuredDir
        : path.join(process.cwd(), configuredDir);
    }
    this.timezone =
      this.configService.get<string>('BUSINESS_TIMEZONE') || DEFAULT_BUSINESS_TIMEZONE;
    await this.ensureLogDir();
  }

  private async ensureLogDir(): Promise<void> {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      this.logger.error(
        `Failed to create audit log directory "${this.logDir}": ${(error as Error).message}`,
      );
    }
  }

  private formatTimestamp(): string {
    const zoned = DateTime.now().setZone(this.timezone);
    if (!zoned.isValid) {
      return new Date().toISOString();
    }
    return `${zoned.toFormat('yyyy-MM-dd HH:mm:ss')} (${this.timezone})`;
  }

  private serialize(value: unknown): string {
    if (value === undefined || value === null) {
      return 'null';
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private buildBlock(category: AuditLogCategory, payload: AuditLogPayload): string {
    const lines: string[] = [
      SEPARATOR,
      `ACTION: ${payload.action}`,
      `TIME: ${this.formatTimestamp()}`,
      `CATEGORY: ${category}`,
    ];

    if (payload.userId) {
      lines.push(`USER_ID: ${payload.userId}`);
    }
    if (payload.entityId) {
      lines.push(`ENTITY_ID: ${payload.entityId}`);
    }
    if (payload.request !== undefined && payload.request !== null) {
      lines.push('REQUEST:', this.serialize(payload.request));
    }
    if (payload.before !== undefined && payload.before !== null) {
      lines.push('BEFORE:', this.serialize(payload.before));
    }
    if (payload.after !== undefined && payload.after !== null) {
      lines.push('AFTER:', this.serialize(payload.after));
    }
    if (payload.details !== undefined && payload.details !== null) {
      lines.push('DETAILS:', this.serialize(payload.details));
    }
    if (payload.response !== undefined && payload.response !== null) {
      lines.push('RESPONSE:', this.serialize(payload.response));
    }

    lines.push(SEPARATOR, '');
    return lines.join('\n');
  }

  async write(category: AuditLogCategory, payload: AuditLogPayload): Promise<void> {
    try {
      await this.ensureLogDir();
      const filePath = path.join(this.logDir, CATEGORY_FILE[category]);
      const block = this.buildBlock(category, payload);
      await fs.appendFile(filePath, block, 'utf8');
    } catch (error) {
      this.logger.error(
        `Audit log write failed [${category}/${payload.action}]: ${(error as Error).message}`,
      );
    }
  }

  logParentCompany(payload: AuditLogPayload): void {
    void this.write('parent-company', payload);
  }

  logDealer(payload: AuditLogPayload): void {
    void this.write('dealer', payload);
  }

  logSite(payload: AuditLogPayload): void {
    void this.write('site', payload);
  }

  logHumanAgent(payload: AuditLogPayload): void {
    void this.write('human-agent', payload);
  }

  logBusinessHours(payload: AuditLogPayload): void {
    void this.write('business-hours', payload);
  }

  logAfterHours(payload: AuditLogPayload): void {
    void this.write('after-hours', payload);
  }

  logPublicHoliday(payload: AuditLogPayload): void {
    void this.write('public-holiday', payload);
  }

  logApiGetBySiteName(payload: AuditLogPayload): void {
    void this.write('api-getBySiteName', payload);
  }

  logApiSearchEmail(payload: AuditLogPayload): void {
    void this.write('api-search-email', payload);
  }

  logApiTransferQuery(payload: AuditLogPayload): void {
    void this.write('api-transfer-query', payload);
  }

  logApiCurrentDay(payload: AuditLogPayload): void {
    void this.write('api-current-day', payload);
  }
}
