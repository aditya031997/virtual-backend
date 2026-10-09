import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FAQ } from '@/schema';
import { FaqController } from '@/FAQ/faqController';
import { FaqService } from '@/FAQ/faqService';

@Module({
    imports: [TypeOrmModule.forFeature([FAQ])],
    controllers: [FaqController],
    providers: [FaqService],
    exports: [FaqService],
})
export class FaqModule {}