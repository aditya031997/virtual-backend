import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteController } from '@/site/siteController';
import { SiteService } from '@/site/siteService';
import { Site, ParentCompany, Dealer, HumanAgent } from '@/schema';
import { User } from '@/schema/user/user.entity';
import { EmailValidationService } from '@/helper/email-validation';
import { PhoneValidationService } from '@/helper/phone-validation';


@Module({
    imports: [
        TypeOrmModule.forFeature([Site, User, ParentCompany, Dealer, HumanAgent])
    ],
    controllers: [SiteController],
    providers: [SiteService, EmailValidationService, PhoneValidationService],
    exports: [SiteService]
})
export class SiteModule {}