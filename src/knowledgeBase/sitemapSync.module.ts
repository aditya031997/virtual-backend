import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Sitemap } from '@/schema/sitemap';
import { Link } from '@/schema/link';
import { SitemapSyncService } from './sitemapSyncService';

@Module({
    imports: [
        TypeOrmModule.forFeature([Sitemap, Link]),
        ConfigModule,
    ],
    providers: [SitemapSyncService],
    exports: [SitemapSyncService],
})
export class SitemapSyncModule { }
