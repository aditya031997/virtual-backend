import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParentCompanyController } from '@/parentCompany/parentCompanyController';
import { ParentCompanyService } from '@/parentCompany/parentCompanyService';
import { ParentCompany, Dealer, HumanAgent, Site } from '@/schema';
import { User } from '@/schema/user/user.entity';
import { EmailValidationService } from '@/helper/email-validation';
import { PhoneValidationService } from '@/helper/phone-validation';

@Module({
    imports: [
        TypeOrmModule.forFeature([ParentCompany, User, Dealer, HumanAgent, Site])
    ],
    controllers: [ParentCompanyController],
    providers: [ParentCompanyService, EmailValidationService, PhoneValidationService],
    exports: [ParentCompanyService]
})
export class ParentCompanyModule {}