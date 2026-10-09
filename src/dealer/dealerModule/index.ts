import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dealer, HumanAgent, ParentCompany, Site } from '@/schema';
import { DealerService } from '@/dealer/dealerService';
import { DealerController } from '@/dealer/dealerController';
import { EmailValidationService } from '@/helper/email-validation';
import { PhoneValidationService } from '@/helper/phone-validation';

@Module({
  imports: [TypeOrmModule.forFeature([Dealer, HumanAgent, ParentCompany, Site])],
  controllers: [DealerController],
  providers: [DealerService, EmailValidationService, PhoneValidationService],
  exports: [DealerService],
})
export class DealerModule {}