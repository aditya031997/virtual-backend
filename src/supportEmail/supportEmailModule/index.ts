import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportEmail } from '@/schema/supportEmail';
import { SupportEmailService } from '@/supportEmail/supportEmailService';
import { SupportEmailController } from '@/supportEmail/supportEmailController';
import { SSEModule } from '@/sse/sseModule';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportEmail]),
    ConfigModule,
    SSEModule,
  ],
  controllers: [SupportEmailController],
  providers: [SupportEmailService],
  exports: [SupportEmailService],
})
export class SupportEmailModule {}

