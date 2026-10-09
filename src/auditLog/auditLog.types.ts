export type AuditLogCategory =
  | 'parent-company'
  | 'dealer'
  | 'site'
  | 'human-agent'
  | 'business-hours'
  | 'after-hours'
  | 'public-holiday'
  | 'api-getBySiteName'
  | 'api-search-email'
  | 'api-transfer-query'
  | 'api-current-day';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'TOGGLE'
  | 'BULK_UPDATE'
  | 'AVAILABILITY_TOGGLE'
  | 'API_CALL';

export interface AuditLogPayload {
  action: AuditAction;
  userId?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown> | unknown;
  before?: Record<string, unknown> | unknown | null;
  after?: Record<string, unknown> | unknown | null;
  request?: Record<string, unknown> | unknown | null;
  response?: Record<string, unknown> | unknown | null;
}
