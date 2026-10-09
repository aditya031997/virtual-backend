import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import axios from 'axios';
import * as xml2js from 'xml2js';
import { KnowledgeBaseHelper } from '@/src/helper';
import { Sitemap } from '@/schema/sitemap';
import { Link } from '@/schema/link';
import { KnowledgeBaseSource } from '@/schema/knowledgeBaseSource';
import { UploadAbortService } from '@/knowledgeBase/uploadAbortService';
import { S3Service } from '@/helper/s3-bucket';

@Injectable()
export class SitemapService {
    private readonly logger = new Logger(SitemapService.name);
    private readonly helper: KnowledgeBaseHelper;
    private readonly elevenLabsClient: ElevenLabsClient;
    private readonly defaultAgentId: string;
    // Secondary agent (the chatbot) kept in sync with the receptionist's KB.
    // Optional — empty string means "no chatbot to sync".
    private readonly chatbotAgentId: string;

    constructor(
        private configService: ConfigService,
        @InjectRepository(Sitemap)
        private sitemapRepository: Repository<Sitemap>,
        @InjectRepository(Link)
        private linkRepository: Repository<Link>,
        @InjectRepository(KnowledgeBaseSource)
        private knowledgeBaseSourceRepository: Repository<KnowledgeBaseSource>,
        private uploadAbortService: UploadAbortService,
        private readonly s3Service: S3Service,
    ) {
        const apiKey = this.configService.get<string>('ELEVENLABS_API_KEY');
        if (!apiKey) {
            throw new Error('ELEVENLABS_API_KEY is not configured');
        }

        const agentId = this.configService.get<string>('ELEVENLABS_AGENT_ID');
        if (!agentId) {
            throw new Error('ELEVENLABS_AGENT_ID is not configured in .env file');
        }
        this.defaultAgentId = agentId;
        this.chatbotAgentId =
            this.configService.get<string>('ELEVENLABS_CHATBOT_AGENT_ID') || '';
        const headers = { 'xi-api-key': apiKey };
        this.helper = new KnowledgeBaseHelper(headers);

        this.elevenLabsClient = new ElevenLabsClient({
            environment: 'https://api.elevenlabs.io/',
            apiKey,
        });
    }

    /**
     * Mirror an ATTACH onto the chatbot agent: add the given document refs to the
     * chatbot agent's own knowledge base. Best-effort (logged + swallowed on failure)
     * so the receptionist sync the caller already did never regresses.
     */
    private async mirrorAttachToChatbotAgent(documents: { type?: string; id: string; name: string }[]) {
        if (!this.chatbotAgentId || !documents?.length) return;
        try {
            const existingAgent = await this.helper.getAgentConfig(this.chatbotAgentId);
            const existingKnowledgeBase = existingAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];
            const existingIds = new Set(existingKnowledgeBase.map((d: any) => d.id));
            const newItems = documents.filter(d => !existingIds.has(d.id));
            if (!newItems.length) return;
            const combined = [
                ...existingKnowledgeBase,
                ...newItems.map(d => ({ type: d.type || 'url', id: d.id, name: d.name })),
            ];
            const ragConfig = existingAgent?.conversation_config?.agent?.prompt?.rag || { enabled: true };
            await this.helper.updateAgentKnowledgeBase(this.chatbotAgentId, combined, ragConfig);
        } catch (error: any) {
            this.logger.warn(
                `Failed to mirror sitemap attach to chatbot agent ${this.chatbotAgentId}: ${error?.message || error}`,
            );
        }
    }

    /**
     * Mirror a batch DETACH onto the chatbot agent: remove the given document ids
     * from the chatbot agent's knowledge base. Best-effort (logged + swallowed).
     */
    private async mirrorBatchDetachFromChatbotAgent(documentIds: string[]) {
        if (!this.chatbotAgentId || !documentIds?.length) return;
        try {
            const existingAgent = await this.helper.getAgentConfig(this.chatbotAgentId);
            const existingKnowledgeBase = existingAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];
            const docIdsSet = new Set(documentIds);
            const newKnowledgeBase = existingKnowledgeBase.filter((d: any) => !docIdsSet.has(d.id));
            if (newKnowledgeBase.length === existingKnowledgeBase.length) return;
            const ragConfig = existingAgent?.conversation_config?.agent?.prompt?.rag || { enabled: true };
            await this.helper.updateAgentKnowledgeBase(this.chatbotAgentId, newKnowledgeBase, ragConfig);
        } catch (error: any) {
            this.logger.warn(
                `Failed to mirror sitemap detach from chatbot agent ${this.chatbotAgentId}: ${error?.message || error}`,
            );
        }
    }

    // ------------------------ HELPER: EXTRACT URLs FROM SITEMAP ------------------------
    private async extractUrlsFromSitemap(sitemapUrl: string): Promise<string[]> {
        try {
            const response = await axios.get(sitemapUrl);
            const xmlData = response.data;

            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(xmlData);

            const urls: string[] = [];

            // Handle standard sitemap (urlset > url > loc)
            if (result.urlset && result.urlset.url) {
                result.urlset.url.forEach((entry: any) => {
                    if (entry.loc && entry.loc[0]) {
                        urls.push(entry.loc[0]);
                    }
                });
            }
            // Handle sitemap index (sitemapindex > sitemap > loc)
            else if (result.sitemapindex && result.sitemapindex.sitemap) {
                result.sitemapindex.sitemap.forEach((entry: any) => {
                    if (entry.loc && entry.loc[0]) {
                        urls.push(entry.loc[0]);
                    }
                });
            }

            return urls;
        } catch (error: any) {
            throw new Error(`Failed to parse sitemap: ${error.message}`);
        }
    }

    // ------------------------ HELPER: UPLOAD URL ONLY (NO ATTACH) ------------------------
    private async uploadUrlOnly(url: string): Promise<{ documentId: string; name: string } | null> {
        try {
            const doc: any = await this.elevenLabsClient.conversationalAi.knowledgeBase.documents.createFromUrl({
                url,
            });
            const documentId = doc.document_id || doc.id || doc.documentId;
            const documentName = doc.name || url;

            if (!documentId) throw new Error('No document ID returned');

            return { documentId, name: documentName };
        } catch (error: any) {
            console.error(`Failed to upload URL ${url}:`, error.message);
            return null;
        }
    }

    private async processUploadedUrlSource(url: string, documentId: string, uploadedName?: string): Promise<void> {
        const fetchedContent = await this.helper.getDocumentDetails(documentId);
        console.log(
            `[KB_CONTENT] documentId=${documentId} name=${fetchedContent.name || 'NA'} url=${fetchedContent.url || 'NA'} extracted_inner_html_length=${fetchedContent.extractedInnerHtml?.length || 0}`,
        );

        await this.helper.uploadDocumentDetailsToInternalApi({
            documentId,
            filename: fetchedContent.filename || null,
            name: fetchedContent.name || uploadedName || 'knowledge-base-url',
            extractedInnerHtml: fetchedContent.extractedInnerHtml,
        });

        const targetFileName = this.buildStorageFileName(
            fetchedContent.name || uploadedName || 'knowledge-base-url',
            documentId,
            '.txt',
        );

        const s3Result = await this.s3Service.uploadTextContent(url, targetFileName);
        await this.saveKnowledgeBaseSource({
            documentId,
            sourceType: 'url',
            s3Key: s3Result.fileUrl,
            originalUrl: url,
        });
        console.log(`[KB_S3] Stored original URL for documentId=${documentId} at key=${s3Result.fileUrl}`);
    }

    private buildStorageFileName(name: string, documentId: string, fallbackExtension: string = ''): string {
        const sanitizedBaseName = name
            .replace(/[\/\\]/g, '-')
            .replace(/\s+/g, ' ')
            .trim();
        const hasExtension = /\.[a-z0-9]+$/i.test(sanitizedBaseName);
        const extension = hasExtension ? '' : fallbackExtension;
        return `${sanitizedBaseName}__${documentId}${extension}`;
    }

    private async processUploadedUrlSourceSafely(url: string, documentId: string, uploadedName?: string): Promise<void> {
        try {
            await this.processUploadedUrlSource(url, documentId, uploadedName);
        } catch (error: any) {
            console.error(`Failed to post-process sitemap URL ${url}:`, error?.message || String(error));
        }
    }

    // ------------------------ ADD SITEMAP (Phase 1: Parse & Save URLs) ------------------------
    async addSitemap(url: string, userId: string) {
        const agentId = this.defaultAgentId;
        if (!agentId) throw new Error('Default Agent ID not configured');

        // Clear any stale abort flag from a previous upload
        this.uploadAbortService.clearAbort(userId);

        // 0. Check if this sitemap URL already exists for this user
        const existingSitemap = await this.sitemapRepository.findOne({
            where: { url, userId, syncStatus: 'success' }
        });
        if (existingSitemap) {
            throw new Error('This sitemap URL has already been added');
        }

        // 1. Fetch & Parse
        const rawUrls = await this.extractUrlsFromSitemap(url);
        if (!rawUrls.length) throw new Error('No URLs found in sitemap');

        // Deduplicate URLs
        const urls = [...new Set(rawUrls)];

        console.log(`Found ${urls.length} unique URLs in sitemap`);

        // 2. Save Sitemap Entity
        const sitemap = this.sitemapRepository.create({
            url,
            userId,
            documentIds: [],
            lastSyncedAt: new Date(),
        });
        const savedSitemap = await this.sitemapRepository.save(sitemap);

        // 3. Save all links to DB with 'pending' status (no documentId yet)
        let skippedCount = 0;
        for (const pageUrl of urls) {
            // Check if link already exists for this user
            const existingLink = await this.linkRepository.findOne({ where: { url: pageUrl, userId } });
            if (existingLink) {
                console.log(`Skipping existing link: ${pageUrl}`);
                skippedCount++;
                continue;
            }

            const newLink = this.linkRepository.create({
                url: pageUrl,
                userId,
                sitemapId: savedSitemap.id,
                status: 'pending'
            });
            await this.linkRepository.save(newLink);
        }

        // Count how many pending links were actually created
        const pendingLinks = await this.linkRepository.count({
            where: { sitemapId: savedSitemap.id, status: 'pending' }
        });

        return {
            success: true,
            message: 'Sitemap parsed and URLs saved. Ready for batch processing.',
            sitemapId: savedSitemap.id,
            totalUrls: urls.length,
            pendingUrls: pendingLinks,
            skippedUrls: skippedCount,
        };
    }

    // ------------------------ GET SITEMAP PROGRESS ------------------------
    async getSitemapProgress(sitemapId: string, userId: string) {
        const sitemap = await this.sitemapRepository.findOne({ where: { id: sitemapId } });
        if (!sitemap) throw new Error('Sitemap not found');
        if (sitemap.userId !== userId) throw new Error('Unauthorized');

        const totalLinks = await this.linkRepository.count({ where: { sitemapId } });
        const successCount = await this.linkRepository.count({ where: { sitemapId, status: 'success' } });
        const pendingCount = await this.linkRepository.count({ where: { sitemapId, status: 'pending' } });
        const errorCount = await this.linkRepository.count({ where: { sitemapId, status: 'error' } });

        return {
            success: true,
            sitemapId,
            total: totalLinks,
            uploaded: successCount,
            pending: pendingCount,
            failed: errorCount,
            completed: pendingCount === 0,
            syncStatus: sitemap.syncStatus,
        };
    }

    // ------------------------ PROCESS BATCH (Phase 2: Upload URLs one-by-one) ------------------------
    async processBatch(sitemapId: string, userId: string, batchSize: number = 20) {
        const agentId = this.defaultAgentId;
        if (!agentId) throw new Error('Default Agent ID not configured');

        // 1. Find the sitemap
        const sitemap = await this.sitemapRepository.findOne({ where: { id: sitemapId } });
        if (!sitemap) throw new Error('Sitemap not found');
        if (sitemap.userId !== userId) throw new Error('Unauthorized');

        // 2. Get the next batch of pending links
        const pendingLinks = await this.linkRepository.find({
            where: { sitemapId, status: 'pending' },
            order: { createdAt: 'ASC' },
            take: batchSize,
        });

        if (pendingLinks.length === 0) {
            return {
                success: true,
                message: 'No pending URLs to process',
                processed: 0,
                failed: 0,
                remaining: 0,
                completed: true,
            };
        }

        const uploadedDocuments: { id: string; name: string }[] = [];
        let processedCount = 0;
        let failedCount = 0;

        // 3. Process each URL one-by-one within this batch
        for (const link of pendingLinks) {
            // Check if user requested abort BEFORE uploading
            if (this.uploadAbortService.shouldAbort(userId)) {
                console.log(`🛑 Upload aborted by user: ${userId} during batch processing.`);
                this.uploadAbortService.clearAbort(userId);

                // Return current progress so frontend knows what happened
                const remaining = await this.linkRepository.count({
                    where: { sitemapId, status: 'pending' }
                });

                return {
                    success: false,
                    message: 'Upload aborted by user',
                    processed: processedCount,
                    failed: failedCount,
                    remaining,
                    completed: false,
                    aborted: true,
                };
            }

            console.log(`Uploading ${link.url}...`);

            // Step A: Upload to ElevenLabs
            const result = await this.uploadUrlOnly(link.url);

            if (result) {
                // Step B: Check abort IMMEDIATELY after ElevenLabs upload completes.
                // If abort was requested while we were uploading, cleanup may have already
                // run and deleted the link record from DB (cascade). In that case, we must
                // delete the just-uploaded document directly from ElevenLabs to prevent orphans.
                if (this.uploadAbortService.shouldAbort(userId)) {
                    console.log(`🛑 Upload aborted by user: ${userId} after uploading ${link.url}. Deleting orphan document ${result.documentId} from ElevenLabs...`);

                    // Delete the just-uploaded document from ElevenLabs immediately
                    try {
                        await this.elevenLabsClient.conversationalAi.knowledgeBase.documents.delete(result.documentId);
                        console.log(`  ✅ Orphan document ${result.documentId} deleted from ElevenLabs`);
                    } catch (deleteError: any) {
                        console.error(`  ⚠️ Failed to delete orphan document ${result.documentId} from ElevenLabs:`, deleteError.message);
                    }

                    this.uploadAbortService.clearAbort(userId);

                    // Try to count remaining, but the link records may already be deleted by cleanup
                    let remaining = 0;
                    try {
                        remaining = await this.linkRepository.count({
                            where: { sitemapId, status: 'pending' }
                        });
                    } catch (countError: any) {
                        console.warn('Could not count remaining links (sitemap may already be cleaned up):', countError.message);
                    }

                    return {
                        success: false,
                        message: 'Upload aborted by user',
                        processed: processedCount,
                        failed: failedCount,
                        remaining,
                        completed: false,
                        aborted: true,
                    };
                }

                // Step C: Save documentId to DB (only if not aborted)
                link.documentId = result.documentId;
                await this.linkRepository.save(link);

                // Step D: Mark as success
                link.status = 'success';
                await this.linkRepository.save(link);

                await this.processUploadedUrlSourceSafely(link.url, result.documentId, result.name);

                uploadedDocuments.push({ id: result.documentId, name: result.name });
                processedCount++;
            } else {
                // Mark as error so we don't retry it forever
                link.status = 'error';
                await this.linkRepository.save(link);
                failedCount++;
            }

            // Small delay between uploads
            await new Promise(r => setTimeout(r, 500));
        }

        // 4. Count remaining pending links
        const remaining = await this.linkRepository.count({
            where: { sitemapId, status: 'pending' }
        });

        return {
            success: true,
            message: `Batch processed: ${processedCount} uploaded, ${failedCount} failed`,
            processed: processedCount,
            failed: failedCount,
            remaining,
            completed: remaining === 0,
            uploadedDocuments: uploadedDocuments.map(d => ({ id: d.id, name: d.name })),
        };
    }

    // ------------------------ FINALIZE SITEMAP (Phase 3: Attach to agent & mark success) ------------------------
    async finalizeSitemap(sitemapId: string, userId: string) {
        const agentId = this.defaultAgentId;
        if (!agentId) throw new Error('Default Agent ID not configured');

        // 1. Find the sitemap
        const sitemap = await this.sitemapRepository.findOne({
            where: { id: sitemapId },
            relations: ['links'],
        });
        if (!sitemap) throw new Error('Sitemap not found');
        if (sitemap.userId !== userId) throw new Error('Unauthorized');

        // 2. Gather all successful documents
        const successfulLinks = sitemap.links.filter(l => l.status === 'success' && l.documentId);
        const uploadedDocuments = successfulLinks.map(l => ({
            id: l.documentId,
            name: l.url,
        }));

        // 3. Batch Attach to Agent
        if (uploadedDocuments.length > 0) {
            const existingAgent = await this.helper.getAgentConfig(agentId);
            const existingKnowledgeBase = existingAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];

            // Filter to ensure we don't attach duplicates that are already in the agent
            const existingIds = new Set(existingKnowledgeBase.map((d: any) => d.id));

            // Dedupe internally just in case
            const uniqueNewDocs: { id: string; name: string }[] = [];
            const seenIds = new Set<string>();
            for (const doc of uploadedDocuments) {
                if (!seenIds.has(doc.id)) {
                    seenIds.add(doc.id);
                    uniqueNewDocs.push(doc);
                }
            }

            const newItems = uniqueNewDocs.filter(d => !existingIds.has(d.id));

            const combinedKnowledgeBase = [
                ...existingKnowledgeBase,
                ...newItems.map(d => ({ type: 'url', id: d.id, name: d.name }))
            ];

            const ragConfig = existingAgent?.conversation_config?.agent?.prompt?.rag || { enabled: true };

            console.log('Attaching to agent:', agentId);
            await this.helper.updateAgentKnowledgeBase(agentId, combinedKnowledgeBase, ragConfig);
            await this.mirrorAttachToChatbotAgent(newItems.map(d => ({ type: 'url', id: d.id, name: d.name })));
        }

        // 4. Update Sitemap Entity with collected IDs and mark as success
        const allDocIds = uploadedDocuments.map(d => d.id);
        sitemap.documentIds = allDocIds;
        sitemap.syncStatus = 'success';
        await this.sitemapRepository.save(sitemap);

        // Clear abort flag
        this.uploadAbortService.clearAbort(userId);

        return {
            success: true,
            message: 'Sitemap finalized and attached to agent successfully',
            totalUploaded: uploadedDocuments.length,
        };
    }

    // ------------------------ SYNC SITEMAP ------------------------
    async syncSitemap(sitemapId: string, userId: string) {
        const sitemap = await this.sitemapRepository.findOne({ where: { id: sitemapId } });
        if (!sitemap) throw new Error('Sitemap not found');

        if (sitemap.userId !== userId) throw new Error('Unauthorized');

        const rawUrls = await this.extractUrlsFromSitemap(sitemap.url);
        const urls = [...new Set(rawUrls)];

        const existingLinks = await this.linkRepository.find({ where: { userId } });
        const existingUrls = new Set(existingLinks.map(l => l.url));

        const newUrls = urls.filter(url => !existingUrls.has(url));

        if (newUrls.length === 0) {
            return { success: true, message: 'No new URLs found in sitemap' };
        }

        console.log(`Found ${newUrls.length} new URLs`);

        const uploadedDocIds: string[] = [...(sitemap.documentIds || [])];
        const newlyUploadedIds: string[] = [];
        const uploadedDocuments: { id: string; name: string }[] = [];

        // Loop only new URLs
        for (const pageUrl of newUrls) {
            console.log(`Uploading new URL ${pageUrl}...`);
            const result = await this.uploadUrlOnly(pageUrl);
            if (result) {
                uploadedDocIds.push(result.documentId);
                newlyUploadedIds.push(result.documentId);
                uploadedDocuments.push({ id: result.documentId, name: result.name });

                const newLink = this.linkRepository.create({
                    url: pageUrl,
                    userId,
                    documentId: result.documentId,
                    sitemapId: sitemap.id
                });
                await this.linkRepository.save(newLink);

                await this.processUploadedUrlSourceSafely(pageUrl, result.documentId, result.name);
            }
            await new Promise(r => setTimeout(r, 500));
        }

        // Batch Attach
        if (newlyUploadedIds.length > 0 && this.defaultAgentId) {
            const existingAgent = await this.helper.getAgentConfig(this.defaultAgentId);
            const existingKnowledgeBase = existingAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];

            const existingIds = new Set(existingKnowledgeBase.map((d: any) => d.id));

            const uniqueNewDocs: { id: string; name: string }[] = [];
            const seenIds = new Set<string>();
            for (const doc of uploadedDocuments) {
                if (!seenIds.has(doc.id)) {
                    seenIds.add(doc.id);
                    uniqueNewDocs.push(doc);
                }
            }

            const newItems = uniqueNewDocs.filter(d => !existingIds.has(d.id));

            const combined = [
                ...existingKnowledgeBase,
                ...newItems.map(d => ({ type: 'url', id: d.id, name: d.name }))
            ];

            const ragConfig = existingAgent?.conversation_config?.agent?.prompt?.rag || { enabled: true };
            await this.helper.updateAgentKnowledgeBase(this.defaultAgentId, combined, ragConfig);
            await this.mirrorAttachToChatbotAgent(newItems.map(d => ({ type: 'url', id: d.id, name: d.name })));
        }

        // Update Sitemap
        sitemap.documentIds = uploadedDocIds;
        sitemap.lastSyncedAt = new Date();
        await this.sitemapRepository.save(sitemap);

        return {
            success: true,
            message: 'Sitemap synced successfully',
            newUrlsFound: newUrls.length,
            newlyUploaded: newlyUploadedIds.length
        };
    }

    // ------------------------ GET PENDING SITEMAPS ------------------------
    async getPendingSitemaps(userId: string) {
        const pending = await this.sitemapRepository.find({
            where: { userId, syncStatus: 'pending' },
            order: { createdAt: 'DESC' }
        });

        return {
            success: true,
            hasPending: pending.length > 0,
            count: pending.length,
            sitemaps: pending.map(s => ({ id: s.id, url: s.url, createdAt: s.createdAt }))
        };
    }

    // ------------------------ CLEANUP PENDING SITEMAPS ------------------------
    async cleanupPendingSitemaps(userId: string) {
        const pendingSitemaps = await this.sitemapRepository.find({
            where: { userId, syncStatus: 'pending' },
            relations: ['links']
        });

        if (pendingSitemaps.length === 0) {
            return { success: true, hasPending: false, cleaned: 0 };
        }

        console.log(`🧹 Cleaning up ${pendingSitemaps.length} pending sitemap(s) for user: ${userId}`);
        let totalCleaned = 0;

        // Collect URLs that have NO documentId (in-flight uploads we can't delete by ID)
        const orphanUrls: string[] = [];

        for (const sitemap of pendingSitemaps) {
            const allLinks = sitemap.links || [];
            const linksWithDocId = allLinks.filter(link => link.documentId);
            const linksWithoutDocId = allLinks.filter(link => !link.documentId);
            const documentIds = linksWithDocId.map(link => link.documentId);
            console.log(`🗑️ Cleaning sitemap ${sitemap.url}: ${documentIds.length} docs with IDs, ${linksWithoutDocId.length} in-flight (no docId yet)`);

            // Collect URLs without documentId for later URL-matching cleanup
            for (const link of linksWithoutDocId) {
                if (link.url) {
                    orphanUrls.push(link.url);
                }
            }

            // 1. Delete documents from ElevenLabs (ones we have IDs for)
            for (const docId of documentIds) {
                try {
                    await this.deleteKnowledgeBaseSourceByDocumentId(docId);
                    await this.elevenLabsClient.conversationalAi.knowledgeBase.documents.delete(docId);
                    console.log(`  ✅ Deleted document ${docId} from ElevenLabs`);
                } catch (error: any) {
                    console.error(`  ⚠️ Failed to delete document ${docId} from ElevenLabs:`, error.message);
                }
            }

            // 2. Try to detach from agent (in case some docs were attached before abort)
            if (documentIds.length > 0 && this.defaultAgentId) {
                try {
                    const existingAgent = await this.helper.getAgentConfig(this.defaultAgentId);
                    const existingKnowledgeBase = existingAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];
                    const docIdsSet = new Set(documentIds);
                    const newKnowledgeBase = existingKnowledgeBase.filter((d: any) => !docIdsSet.has(d.id));

                    if (newKnowledgeBase.length !== existingKnowledgeBase.length) {
                        const ragConfig = existingAgent?.conversation_config?.agent?.prompt?.rag || { enabled: true };
                        await this.helper.updateAgentKnowledgeBase(this.defaultAgentId, newKnowledgeBase, ragConfig);
                        console.log(`  ✅ Detached ${existingKnowledgeBase.length - newKnowledgeBase.length} documents from agent`);
                    }
                    await this.mirrorBatchDetachFromChatbotAgent(documentIds);
                } catch (error: any) {
                    console.error('  ⚠️ Error detaching documents from agent:', error.message);
                }
            }

            // 3. Delete sitemap from DB (cascade deletes links)
            await this.sitemapRepository.remove(sitemap);
            totalCleaned++;
            console.log(`  ✅ Sitemap ${sitemap.url} cleaned up successfully`);
        }

        // 4. URL-matching cleanup: Find and delete orphaned documents on ElevenLabs
        //    These are documents that were being uploaded (in-flight) when abort happened.
        //    They had no documentId in our DB, but ElevenLabs may have finished creating them.
        if (orphanUrls.length > 0) {
            console.log(`🔍 Checking ElevenLabs for ${orphanUrls.length} potentially orphaned URL(s)...`);

            // Wait a few seconds to let any in-flight ElevenLabs uploads finish
            await new Promise(r => setTimeout(r, 5000));

            try {
                // List all documents from ElevenLabs knowledge base
                const allElevenLabsDocs = await this.helper.getAllDocuments();
                const documents = allElevenLabsDocs?.documents || allElevenLabsDocs || [];

                if (Array.isArray(documents) && documents.length > 0) {
                    const orphanUrlSet = new Set(orphanUrls);
                    const orphanDocIds: string[] = [];

                    // Match ElevenLabs documents by name (name = URL for URL-type documents)
                    for (const doc of documents) {
                        const docName = doc.name || '';
                        if (orphanUrlSet.has(docName)) {
                            orphanDocIds.push(doc.id);
                            console.log(`  🔗 Found orphan document: ${doc.id} (${docName})`);
                        }
                    }

                    // Delete orphaned documents from ElevenLabs
                    for (const docId of orphanDocIds) {
                        try {
                            await this.elevenLabsClient.conversationalAi.knowledgeBase.documents.delete(docId);
                            console.log(`  ✅ Deleted orphan document ${docId} from ElevenLabs`);
                        } catch (error: any) {
                            console.error(`  ⚠️ Failed to delete orphan document ${docId}:`, error.message);
                        }
                    }

                    if (orphanDocIds.length > 0) {
                        console.log(`  ✅ Cleaned up ${orphanDocIds.length} orphaned document(s) from ElevenLabs`);
                    } else {
                        console.log(`  ℹ️ No orphaned documents found on ElevenLabs (in-flight uploads may not have completed)`);
                    }
                }
            } catch (error: any) {
                console.error('  ⚠️ Error during URL-matching cleanup:', error.message);
            }
        }

        console.log(`✅ Cleanup complete. Cleaned ${totalCleaned} pending sitemap(s)`);

        return { success: true, hasPending: true, cleaned: totalCleaned };
    }

    // ------------------------ DELETE SITEMAP ------------------------
    async deleteSitemap(sitemapId: string, userId: string) {
        // 1. Find Sitemap
        const sitemap = await this.sitemapRepository.findOne({
            where: { id: sitemapId },
            relations: ['links'] // Fetch children links
        });

        if (!sitemap) throw new Error('Sitemap not found');
        if (sitemap.userId !== userId) throw new Error('Unauthorized');

        const documentIds = sitemap.links?.map(link => link.documentId).filter(Boolean) || [];

        console.log(`Deleting sitemap ${sitemap.url} with ${documentIds.length} associated documents`);

        // 2. Detach from Agent (Batch)
        if (documentIds.length > 0 && this.defaultAgentId) {
            try {
                const existingAgent = await this.helper.getAgentConfig(this.defaultAgentId);
                const existingKnowledgeBase = existingAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];

                // Filter out the IDs needed for deletion
                const docIdsSet = new Set(documentIds);
                const newKnowledgeBase = existingKnowledgeBase.filter((d: any) => !docIdsSet.has(d.id));

                const ragConfig = existingAgent?.conversation_config?.agent?.prompt?.rag || { enabled: true };
                await this.helper.updateAgentKnowledgeBase(this.defaultAgentId, newKnowledgeBase, ragConfig);
                console.log('Detached documents from agent');
                await this.mirrorBatchDetachFromChatbotAgent(documentIds);
            } catch (error: any) {
                console.error('Error detaching from agent:', error.message);
                // Continue deletion even if agent update fails (best effort)
            }
        }

        // 3. Delete from ElevenLabs
        for (const docId of documentIds) {
            try {
                await this.deleteKnowledgeBaseSourceByDocumentId(docId);
                await this.elevenLabsClient.conversationalAi.knowledgeBase.documents.delete(docId);
            } catch (error: any) {
                console.error(`Failed to delete document ${docId} from ElevenLabs:`, error.message);
            }
        }

        // 4. Delete from Database (Cascade will handle Links)
        await this.sitemapRepository.remove(sitemap);

        return {
            success: true,
            message: 'Sitemap and all associated links deleted successfully',
            deletedCount: documentIds.length
        };
    }

    private async saveKnowledgeBaseSource(input: {
        documentId: string;
        sourceType: 'file' | 'url' | 'text';
        s3Key: string | null;
        originalUrl: string | null;
    }): Promise<void> {
        const existingSource = await this.knowledgeBaseSourceRepository.findOne({
            where: { documentId: input.documentId },
        });

        const sourceRecord = this.knowledgeBaseSourceRepository.create({
            ...existingSource,
            documentId: input.documentId,
            sourceType: input.sourceType,
            s3Key: input.s3Key,
            originalUrl: input.originalUrl,
        });

        await this.knowledgeBaseSourceRepository.save(sourceRecord);
    }

    private async deleteKnowledgeBaseSourceByDocumentId(documentId: string): Promise<void> {
        const storedSource = await this.knowledgeBaseSourceRepository.findOne({
            where: { documentId },
        });

        if (storedSource?.s3Key) {
            try {
                await this.s3Service.deleteFile(storedSource.s3Key);
            } catch (error: any) {
                console.error(`Failed to delete S3 source ${storedSource.s3Key} for sitemap document ${documentId}:`, error.message);
            }
        }

        await this.knowledgeBaseSourceRepository.delete({ documentId });
    }
}
