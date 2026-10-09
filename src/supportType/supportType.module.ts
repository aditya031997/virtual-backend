import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTypeService } from '@/supportType/supportType.service';
import { SupportTypeController } from '@/supportType/supportType.controller';
import { SupportType } from '@/schema';

@Module({
  imports: [TypeOrmModule.forFeature([SupportType])],
  controllers: [SupportTypeController],
  providers: [SupportTypeService],
  exports: [SupportTypeService],
})
export class SupportTypeModule {}