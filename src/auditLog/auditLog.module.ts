import { Global, Module } from '@nestjs/common';
import { AuditFileLoggerService } from '@/auditLog/auditFileLogger.service';

@Global()
@Module({
  providers: [AuditFileLoggerService],
  exports: [AuditFileLoggerService],
})
export class AuditLogModule {}
