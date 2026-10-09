import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as xml2js from 'xml2js';
import { Sitemap } from '@/schema/sitemap';
import { Link } from '@/schema/link';
import { KnowledgeBaseHelper } from '@/src/helper';

interface SitemapUrl {
    loc: string[];
}

interface SitemapData {
    urlset?: {
        url?: SitemapUrl[];
    };
}

@Injectable()
export class SitemapSyncService {
    private readonly helper: KnowledgeBaseHelper;
    private readonly defaultAgentId: string;

    constructor(
        private configService: ConfigService,
        @InjectRepository(Sitemap)
        private sitemapRepository: Repository<Sitemap>,
        @InjectRepository(Link)
        private linkRepository: Repository<Link>,
    ) {
        const apiKey = this.configService.get<string>('ELEVENLABS_API_KEY');
        if (!apiKey) {
            throw new Error('ELEVENLABS_API_KEY is not configured');
        }

        const headers = { 'xi-api-key': apiKey };
        this.helper = new KnowledgeBaseHelper(headers);
        this.defaultAgentId = this.configService.get<string>('ELEVENLABS_AGENT_ID') || '';
    }

    /**
     * Fetch and parse sitemap XML to extract URLs
     */
    async fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
        try {
            const response = await axios.get(sitemapUrl, {
                timeout: 30000, // 30 seconds
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SitemapSyncBot/1.0)',
                },
            });

            const parser = new xml2js.Parser();
            const result: SitemapData = await parser.parseStringPromise(response.data);

            const urls: string[] = [];
            if (result.urlset && result.urlset.url) {
                for (const urlEntry of result.urlset.url) {
                    if (urlEntry.loc && urlEntry.loc[0]) {
                        // Normalize URL: trim whitespace
                        const url = urlEntry.loc[0].trim();
                        if (url) {
                            urls.push(url);
                        }
                    }
                }
            }

            return urls;
        } catch (error: any) {
            throw new Error(`Failed to fetch sitemap: ${error.message}`);
        }
    }

    /**
     * Compare current URLs with new URLs to find added and removed
     */
    compareUrls(
        currentUrls: string[],
        newUrls: string[]
    ): { added: string[]; removed: string[] } {
        const currentSet = new Set(currentUrls);
        const newSet = new Set(newUrls);

        const added = newUrls.filter((url) => !currentSet.has(url));
        const removed = currentUrls.filter((url) => !newSet.has(url));

        return { added, removed };
    }

    /**
     * Add new URLs to ElevenLabs and database
     */
    async addNewUrls(
        urls: string[],
        sitemapId: string,
        userId: string,
    ): Promise<void> {
        if (urls.length === 0) return;

        for (const url of urls) {
            try {
                // Check 1: Already exists under this sitemap — skip entirely
                const existingLink = await this.linkRepository.findOne({
                    where: { sitemapId, url }
                });

                if (existingLink) continue;

                // Check 2: Exists as an orphan link (same user, no sitemapId)
                // Adopt it into the sitemap instead of creating a duplicate.
                const orphanLink = await this.linkRepository.findOne({
                    where: { url, userId, sitemapId: IsNull() }
                });

                if (orphanLink) {
                    await this.linkRepository.query(
                        `UPDATE link SET "sitemapId" = $1 WHERE id = $2`,
                        [sitemapId, orphanLink.id]
                    );
                    continue;
                }

                // New URL — upload to ElevenLabs and save to database
                const elevenLabsDoc = await this.helper.uploadUrl(url);

                // Use raw SQL to bypass TypeORM relation mapping issues
                await this.linkRepository.query(
                    `INSERT INTO link (url, "documentId", "sitemapId", "userId", status) VALUES ($1, $2, $3, $4, $5)`,
                    [url, elevenLabsDoc.id, sitemapId, userId, 'success']
                );
            } catch (error: any) {
                // Continue with next URL even if one fails
            }
        }
    }

    /**
     * Remove old URLs from ElevenLabs and database
     */
    async removeOldUrls(
        urls: string[],
        sitemapId: string,
    ): Promise<void> {
        if (urls.length === 0) return;

        for (const url of urls) {
            try {
                const link = await this.linkRepository.findOne({
                    where: { url, sitemapId },
                });

                if (!link) continue;

                await this.helper.deleteDocumentFromKnowledgeBase(link.documentId);
                await this.linkRepository.remove(link);
            } catch (error: any) {
                // Continue with next URL even if one fails
            }
        }
    }

    /**
     * Sync a single sitemap
     */
    async syncSingleSitemap(sitemapId: string): Promise<void> {
        try {
            // Get sitemap from database — DO NOT load 'links' relation!
            // Loading relations causes TypeORM to orphan (nullify sitemapId) any
            // links that aren't in the loaded array when we save() the sitemap later.
            const sitemap = await this.sitemapRepository.findOne({
                where: { id: sitemapId },
            });

            if (!sitemap) {
                throw new Error(`Sitemap not found: ${sitemapId}`);
            }

            // Update status to syncing — using update() to avoid relation side-effects
            await this.sitemapRepository.update(sitemapId, { syncStatus: 'syncing' });

            // Fetch latest URLs from sitemap
            const newUrls = await this.fetchSitemapUrls(sitemap.url);

            // Get current URLs from database — query links separately
            const currentLinks = await this.linkRepository.find({
                where: { sitemapId },
                select: ['url'],
            });
            const currentUrls = currentLinks.map((link) => link.url);

            // Compare URLs
            const { added, removed } = this.compareUrls(currentUrls, newUrls);

            // Add new URLs (pass userId from sitemap for the link records)
            await this.addNewUrls(added, sitemapId, sitemap.userId);

            // Remove old URLs
            await this.removeOldUrls(removed, sitemapId);

            // Update sitemap status — using update() to avoid relation side-effects
            await this.sitemapRepository.update(sitemapId, {
                syncStatus: 'success',
                syncErrorMessage: null,
                lastSyncedAt: new Date(),
            });

        } catch (error: any) {

            // Update sitemap with error status — using update() to avoid relation side-effects
            await this.sitemapRepository.update(sitemapId, {
                syncStatus: 'error',
                syncErrorMessage: error.message,
            });

            throw error;
        }
    }

    /**
     * Sync all sitemaps
     */
    async syncAllSitemaps(): Promise<void> {
        try {
            // Get all sitemaps
            const sitemaps = await this.sitemapRepository.find();

            if (sitemaps.length === 0) return;

            let successCount = 0;
            let errorCount = 0;

            // Sync each sitemap
            for (const sitemap of sitemaps) {
                try {
                    await this.syncSingleSitemap(sitemap.id);
                    successCount++;
                } catch (error) {
                    errorCount++;
                    // Continue with next sitemap even if one fails
                }
            }

        } catch (error: any) {
            throw error;
        }
    }
}
