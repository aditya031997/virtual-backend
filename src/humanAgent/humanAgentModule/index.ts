import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HumanAgentService } from '@/humanAgent/humanAgentService';
import { HumanAgentController } from '@/humanAgent/humanAgentController';
import { HumanAgent, Dealer, SupportType, ParentCompany, Site } from '@/schema';
import { User } from '@/schema/user/user.entity';
import { EmailValidationService } from '@/helper/email-validation';
import { PhoneValidationService } from '@/helper/phone-validation';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HumanAgent, 
      Dealer, 
      User,
      SupportType,
      ParentCompany,
      Site
    ])
  ],
  controllers: [HumanAgentController],
  providers: [HumanAgentService, EmailValidationService, PhoneValidationService],
  exports: [HumanAgentService],
})
export class HumanAgentModule { }