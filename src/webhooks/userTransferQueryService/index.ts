import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserTransferQuery, UserTransferQueryStatus } from '@/schema/userTransferQuery';
import {
  AgentQueryInput,
  CreateUserTransferQueryDto,
  UpdateUserTransferQueryDto,
  UpdateUserTransferQueryStatusDto,
} from '@/webhooks/dto/userTransferQuery/index.dto';
import { sanitizeAlternateCallbackNumberInput } from '@/helper/callbackNumberSanitize';
import { AuditFileLoggerService } from '@/auditLog';

function optionalTrim(s: string | undefined): string | null {
  if (s === undefined || s === null) {
    return null;
  }
  const t = s.trim();
  return t === '' ? null : t;
}

@Injectable()
export class UserTransferQueryService {
  constructor(
    @InjectRepository(UserTransferQuery)
    private readonly repo: Repository<UserTransferQuery>,
    private readonly auditFileLogger: AuditFileLoggerService,
  ) {}

  private normalizeAgentQuery(raw: AgentQueryInput | undefined): unknown | null {
    if (raw === undefined || raw === null) {
      return null;
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed === '' || trimmed === '[]') {
        return null;
      }
      try {
        return JSON.parse(trimmed) as unknown;
      } catch {
        throw new BadRequestException('agent_query must be valid JSON when sent as a string');
      }
    }
    return raw as unknown;
  }

  async create(
    dto: CreateUserTransferQueryDto,
  ): Promise<{ id: string; queryStatus: UserTransferQueryStatus }> {
    const agentQuery = this.normalizeAgentQuery(dto.agent_query);

    const row = this.repo.create({
      queryStatus: 'pending',
      currentCallSid: optionalTrim(dto.current_call_sid),
      conversationId: optionalTrim(dto.conversation_id),
      callerName: optionalTrim(dto.caller_name),
      callerEmail: optionalTrim(dto.caller_email),
      callerPhone: optionalTrim(dto.caller_phone),
      callBackNumber: sanitizeAlternateCallbackNumberInput(dto.call_back_number),
      callerQuery: optionalTrim(dto.caller_query),
      siteName: optionalTrim(dto.site_name),
      agentQuery,
    });

    const saved = await this.repo.save(row);
    this.auditFileLogger.logApiTransferQuery({
      action: 'CREATE',
      entityId: saved.id,
      request: dto as unknown as Record<string, unknown>,
      after: {
        id: saved.id,
        queryStatus: saved.queryStatus,
        conversationId: saved.conversationId,
        siteName: saved.siteName,
        callerName: saved.callerName,
        callerEmail: saved.callerEmail,
        callerPhone: saved.callerPhone,
      },
    });
    return { id: saved.id, queryStatus: saved.queryStatus };
  }

  async findPendingByConversationId(
    conversationId: string,
  ): Promise<UserTransferQuery | null> {
    const cid = conversationId?.trim();
    if (!cid) {
      console.log('[UserTransferQuery] pending lookup skipped: empty conversation_id');
      return null;
    }
    console.log('[UserTransferQuery] fetching pending row', {
      conversationId: cid,
      queryStatus: 'pending',
    });
    const row = await this.repo.findOne({
      where: { conversationId: cid, queryStatus: 'pending' },
    });
    console.log('[UserTransferQuery] pending lookup result', {
      conversationId: cid,
      found: !!row,
      rowId: row?.id ?? null,
      siteName: row?.siteName ?? null,
    });
    return row;
  }

  async updateStatusById(
    id: string,
    status: UserTransferQueryStatus,
  ): Promise<void> {
    await this.repo.update({ id }, { queryStatus: status });
  }

  async updateStatus(
    id: string,
    dto: UpdateUserTransferQueryStatusDto,
  ): Promise<{ id: string; queryStatus: UserTransferQueryStatus }> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Transfer query ${id} not found`);
    }
    const before = { queryStatus: row.queryStatus };
    row.queryStatus = dto.query_status;
    const saved = await this.repo.save(row);
    this.auditFileLogger.logApiTransferQuery({
      action: 'UPDATE',
      entityId: id,
      before,
      after: { queryStatus: saved.queryStatus },
      details: { field: 'query_status' },
    });
    return { id: saved.id, queryStatus: saved.queryStatus };
  }

  async update(
    id: string,
    dto: UpdateUserTransferQueryDto,
  ): Promise<{ id: string; queryStatus: UserTransferQueryStatus }> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Transfer query ${id} not found`);
    }

    const before = {
      queryStatus: row.queryStatus,
      conversationId: row.conversationId,
      siteName: row.siteName,
      callerName: row.callerName,
      callerEmail: row.callerEmail,
      callerPhone: row.callerPhone,
      callerQuery: row.callerQuery,
    };

    if (dto.query_status !== undefined) {
      row.queryStatus = dto.query_status;
    }
    if (dto.current_call_sid !== undefined) {
      row.currentCallSid = optionalTrim(dto.current_call_sid);
    }
    if (dto.conversation_id !== undefined) {
      row.conversationId = optionalTrim(dto.conversation_id);
    }
    if (dto.caller_name !== undefined) {
      row.callerName = optionalTrim(dto.caller_name);
    }
    if (dto.caller_email !== undefined) {
      row.callerEmail = optionalTrim(dto.caller_email);
    }
    if (dto.caller_phone !== undefined) {
      row.callerPhone = optionalTrim(dto.caller_phone);
    }
    if (dto.call_back_number !== undefined) {
      row.callBackNumber = sanitizeAlternateCallbackNumberInput(dto.call_back_number);
    }
    if (dto.caller_query !== undefined) {
      row.callerQuery = optionalTrim(dto.caller_query);
    }
    if (dto.site_name !== undefined) {
      row.siteName = optionalTrim(dto.site_name);
    }
    if (dto.agent_query !== undefined) {
      row.agentQuery = this.normalizeAgentQuery(dto.agent_query);
    }

    const saved = await this.repo.save(row);
    this.auditFileLogger.logApiTransferQuery({
      action: 'UPDATE',
      entityId: id,
      request: dto as unknown as Record<string, unknown>,
      before,
      after: {
        queryStatus: saved.queryStatus,
        conversationId: saved.conversationId,
        siteName: saved.siteName,
        callerName: saved.callerName,
        callerEmail: saved.callerEmail,
        callerPhone: saved.callerPhone,
        callerQuery: saved.callerQuery,
      },
    });
    return { id: saved.id, queryStatus: saved.queryStatus };
  }
}
