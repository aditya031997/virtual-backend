import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Link } from '@/schema';
import { LinkService } from '@/links/linkService';
import { LinkController } from '@/links/linkController';

@Module({
    imports: [TypeOrmModule.forFeature([Link])],
    controllers: [LinkController],
    providers: [LinkService],
    exports: [LinkService],
})
export class LinkModule {}