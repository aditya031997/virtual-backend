import cron from 'node-cron';
import { INestApplicationContext } from '@nestjs/common';
import { SitemapSyncService } from '@/knowledgeBase/sitemapSyncService';

/**
 * Start the sitemap sync cron job
 * Runs every 1 minute for testing (change to '0 2 * * *' for daily at 2 AM in production)
 */
export function startSitemapSyncCron(app: INestApplicationContext): void {
    // Get cron expression from environment or use default (every 1 minute for testing)
    const cronExpression = process.env.SITEMAP_SYNC_CRON || '*/1 * * * *';
    const isEnabled = process.env.ENABLE_SITEMAP_SYNC !== 'false'; // Enabled by default

    if (!isEnabled) {
        console.log('⏸️  Sitemap sync cron is disabled');
        return;
    }

    // Get the service instance from the app context
    const sitemapSyncService = app.get(SitemapSyncService);

    // Schedule the cron job
    cron.schedule(cronExpression, async () => {
        try {
            await sitemapSyncService.syncAllSitemaps();
        } catch (error: any) {
            console.error(`❌ Cron job error: ${error.message}`);
        }
    });

    console.log('✅ Sitemap sync cron job started successfully\n');
}
