import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import OpenAI from 'openai';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { PDFDocument } from 'pdf-lib';
import * as mammoth from 'mammoth';
import { Document, KnowledgeBaseSource } from '@/schema';
import { CreateDocumentDto, UpdateDocumentDto, QueryDocumentDto } from '@/document/dto';
import { DEFAULT_DOCUMENT_VISIBILITY } from '@/types/document';
import { S3Service } from '@/helper/s3-bucket';
import { KnowledgeBaseHelper } from '@/helper/knowledgeBase';
import { TextractOcrService } from '@/helper/textract-ocr';

type BufferedUploadFile = Express.Multer.File & {
    buffer: Buffer;
    size: number;
};

type RawUploadChunk = {
    buffer: Buffer;
    mimetype: string;
    extension: string;
    processingStrategy: string;
};

type PreparedUploadChunk = {
    file: BufferedUploadFile;
};

@Injectable()
export class DocumentService {
    private readonly logger = new Logger(DocumentService.name);
    private readonly knowledgeBaseMaxFileSize = 15 * 1024 * 1024;
    private readonly textChunkTargetSize = 9 * 1024 * 1024;
    private readonly knowledgeBaseHelper: KnowledgeBaseHelper | null;
    private readonly elevenLabsClient: ElevenLabsClient | null;
    private readonly openai: OpenAI | null;
    private readonly defaultAgentId: string;
    // Secondary agent (the chatbot) kept in sync with the receptionist's KB.
    // Optional — empty string means "no chatbot to sync".
    private readonly chatbotAgentId: string;

    constructor(
        private readonly configService: ConfigService,
        @InjectRepository(Document)
        private readonly documentRepository: Repository<Document>,
        @InjectRepository(KnowledgeBaseSource)
        private readonly knowledgeBaseSourceRepository: Repository<KnowledgeBaseSource>,
        private readonly s3Service: S3Service,
        private readonly textractOcrService: TextractOcrService,
    ) {
        const elevenLabsApiKey = this.configService.get<string>('ELEVENLABS_API_KEY');
        this.defaultAgentId = this.configService.get<string>('ELEVENLABS_AGENT_ID') || '';
        this.chatbotAgentId = this.configService.get<string>('ELEVENLABS_CHATBOT_AGENT_ID') || '';

        if (elevenLabsApiKey) {
            const headers = { 'xi-api-key': elevenLabsApiKey };
            this.knowledgeBaseHelper = new KnowledgeBaseHelper(headers);
            this.elevenLabsClient = new ElevenLabsClient({
                environment: 'https://api.elevenlabs.io/',
                apiKey: elevenLabsApiKey,
            });
        } else {
            this.knowledgeBaseHelper = null;
            this.elevenLabsClient = null;
            this.logger.warn('ELEVENLABS_API_KEY is not configured. Knowledge base uploads are disabled.');
        }

        const openAiApiKey = this.configService.get<string>('OPENAI_API_KEY');
        this.openai = openAiApiKey ? new OpenAI({ apiKey: openAiApiKey }) : null;
    }

    /**
     * Create document with file upload to S3
     */
  async createWithFile(
    createDocumentDto: CreateDocumentDto & { userId: string },
    file: Express.Multer.File
): Promise<Document | Document[]> {
    if (createDocumentDto.agentId) {
        return this.createWithKnowledgeBaseProcessing(createDocumentDto, file);
    }

    try {
        // Step 1: Upload file to S3
        this.logger.log(`Uploading file to S3: ${file.originalname}`);
        const uploadResult = await this.s3Service.uploadFile(file);

        // Extract file extension from original filename
        const fileExtension = file.originalname.split('.').pop()?.toLowerCase() || '';

        // Step 2: Create document record in database
        const document = this.documentRepository.create({
            fileName: createDocumentDto.fileName || uploadResult.fileName,
            folderId: createDocumentDto.folderId,
            userId: createDocumentDto.userId,
            fileUrl: uploadResult.fileUrl,
            fileType: fileExtension, // Use file extension instead of mimetype
            fileSize: uploadResult.fileSize,
            mimeType: uploadResult.mimeType,
            // || not ??, deliberately: an empty string must fall through to the
            // restrictive default, and ?? would write it as a blank visibility.
            visibility: createDocumentDto.visibility || DEFAULT_DOCUMENT_VISIBILITY,
            ...(createDocumentDto.documentId && { documentId: createDocumentDto.documentId }),
        });

        const savedDocument = await this.documentRepository.save(document);
        this.logger.log(`Document created successfully with ID: ${savedDocument.id}${savedDocument.documentId ? `, documentId: ${savedDocument.documentId}` : ''}`);

        return savedDocument;
    } catch (error) {
        this.logger.error(`Error creating document: ${error.message}`, error.stack);

        // If S3 upload succeeded but DB save failed, we should clean up S3
        if (error.uploadResult) {
            try {
                await this.s3Service.deleteFile(error.uploadResult.fileUrl);
                this.logger.log('Cleaned up S3 file after DB failure');
            } catch (cleanupError) {
                this.logger.error('Failed to cleanup S3 file', cleanupError);
            }
        }

        throw new BadRequestException('Failed to create document');
    }
}

    private async createWithKnowledgeBaseProcessing(
        createDocumentDto: CreateDocumentDto & { userId: string },
        file: Express.Multer.File,
    ): Promise<Document[]> {
        this.ensureKnowledgeBaseConfigured();

        const chunks = await this.prepareUploadChunks(file);
        const pendingDocuments: Document[] = [];
        const uploadedKnowledgeBaseDocs: Array<{ id: string; name: string }> = [];
        const agentId = createDocumentDto.agentId || this.defaultAgentId;

        if (!agentId) {
            throw new BadRequestException('Agent ID is required for knowledge base uploads');
        }

        try {
            for (const chunk of chunks) {
                const pendingDocument = await this.createPendingDocumentRecord(
                    createDocumentDto,
                    chunk,
                );
                pendingDocuments.push(pendingDocument);

                const uploadedDocument = await this.uploadChunkWithOcrFallback(chunk.file);
                pendingDocument.documentId = uploadedDocument.id;
                await this.documentRepository.save(pendingDocument);

                await this.syncStoredFileWithKnowledgeBaseDocumentSafely(pendingDocument, chunk.file, uploadedDocument);

                uploadedKnowledgeBaseDocs.push({
                    id: uploadedDocument.id,
                    name: uploadedDocument.name || chunk.file.originalname,
                });
            }

            await this.attachDocumentsToAgent(agentId, uploadedKnowledgeBaseDocs);

            for (const pendingDocument of pendingDocuments) {
                pendingDocument.status = 'success';
                await this.documentRepository.save(pendingDocument);
            }

            return this.documentRepository.find({
                where: pendingDocuments.map((document) => ({ id: document.id })),
                relations: ['folder', 'user'],
                order: { createdAt: 'DESC' },
            });
        } catch (error: any) {
            this.logger.error(`Knowledge base upload batch failed: ${error.message}`, error.stack);

            try {
                await this.cleanupPendingUploads(createDocumentDto.userId);
            } catch (cleanupError: any) {
                this.logger.error(`Failed to cleanup pending uploads: ${cleanupError.message}`, cleanupError.stack);
            }

            throw new BadRequestException(error.message || 'Failed to process knowledge base upload');
        }
    }

    /**
     * Find all documents with optional filters
     * Supports filtering by folderId, userId, fileType, and documentId
     */
    async findAll(query?: QueryDocumentDto): Promise<Document[]> {
        try {
            const filters: Record<string, any> = {};

            // Apply filters if provided
            if (query?.documentId) {
                filters.documentId = query.documentId;
                this.logger.log(`Filtering documents by documentId: ${query.documentId}`);
            }

            if (query?.folderId) {
                filters.folderId = query.folderId;
                this.logger.log(`Filtering documents by folderId: ${query.folderId}`);
            }

            if (query?.userId) {
                filters.userId = query.userId;
                this.logger.log(`Filtering documents by userId: ${query.userId}`);
            }

            if (query?.fileType) {
                filters.fileType = query.fileType;
                this.logger.log(`Filtering documents by fileType: ${query.fileType}`);
            }

            const documents = await this.documentRepository.find({
                where: [
                    { ...filters, status: 'success' },
                    { ...filters, status: IsNull() },
                ],
                relations: ['folder', 'user'],
                order: { createdAt: 'DESC' },
            });

            this.logger.log(`Found ${documents.length} document(s)`);
            return documents;
        } catch (error) {
            this.logger.error(`Error fetching documents: ${error.message}`, error.stack);
            throw new BadRequestException('Failed to fetch documents');
        }
    }

    /**
     * Find documents by folder ID
     */
    async findByFolderId(folderId: string): Promise<Document[]> {
        try {
            this.logger.log(`Fetching all documents for folderId: ${folderId}`);

            const documents = await this.documentRepository.find({
                where: [
                    { folderId, status: 'success' },
                    { folderId, status: IsNull() },
                ],
                relations: ['folder', 'user'],
                order: { createdAt: 'DESC' },
            });

            this.logger.log(`Found ${documents.length} document(s) in folder ${folderId}`);
            return documents;
        } catch (error) {
            this.logger.error(`Error fetching documents by folderId: ${error.message}`, error.stack);
            throw new BadRequestException(`Failed to fetch documents for folder ${folderId}`);
        }
    }

    /**
     * Find one document by ID
     */
    async findOne(id: string): Promise<Document> {
        const document = await this.documentRepository.findOne({
            where: { id },
            relations: ['folder', 'user'],
        });

        if (!document) {
            throw new NotFoundException(`Document with ID ${id} not found`);
        }

        return document;
    }

    /**
     * Find one document by external documentId
     */
    async findByDocumentId(documentId: string): Promise<Document> {
        const document = await this.documentRepository.findOne({
            where: { documentId },
            relations: ['folder', 'user'],
        });

        if (!document) {
            throw new NotFoundException(`Document with documentId ${documentId} not found`);
        }

        return document;
    }

    /**
     * Get presigned download URL for a document
     */
    async getDownloadUrl(id: string): Promise<{ downloadUrl: string; fileName: string }> {
        const document = await this.findOne(id);

        const downloadUrl = await this.s3Service.getPresignedUrl(document.fileUrl);

        return {
            downloadUrl,
            fileName: document.fileName,
        };
    }

    /**
     * Update document metadata
     */
    async update(id: string, updateDocumentDto: UpdateDocumentDto): Promise<Document> {
        const document = await this.findOne(id);

        // Only update allowed fields
        if (updateDocumentDto.documentId !== undefined) {
            document.documentId = updateDocumentDto.documentId;
        }
        
        if (updateDocumentDto.fileName !== undefined) {
            document.fileName = updateDocumentDto.fileName;
        }
        
        if (updateDocumentDto.folderId !== undefined) {
            document.folderId = updateDocumentDto.folderId;
        }

        // Widening or narrowing who may receive a document is a deliberate admin
        // action, so an omitted value leaves the existing one alone rather than
        // resetting it to the default.
        if (updateDocumentDto.visibility !== undefined) {
            document.visibility = updateDocumentDto.visibility;
        }

        try {
            const updatedDocument = await this.documentRepository.save(document);
            this.logger.log(`Document updated successfully: ${id}`);
            return updatedDocument;
        } catch (error) {
            this.logger.error(`Failed to update document: ${error.message}`, error.stack);
            throw new BadRequestException('Failed to update document');
        }
    }

    /**
     * Delete document from both S3 and database
     */
    async remove(id: string): Promise<void> {
        const document = await this.findOne(id);

        try {
            await this.cleanupDocuments([document]);
            this.logger.log(`Document deleted successfully: ${id}`);
        } catch (error) {
            this.logger.error(`Error deleting document: ${error.message}`, error.stack);
            throw new BadRequestException('Failed to delete document');
        }
    }

    /**
     * Get document count by folder ID
     */
    async getDocumentCountByFolder(folderId: string): Promise<number> {
        try {
            const count = await this.documentRepository.count({
                where: { folderId },
            });

            this.logger.log(`Folder ${folderId} has ${count} document(s)`);
            return count;
        } catch (error) {
            this.logger.error(`Error counting documents: ${error.message}`, error.stack);
            throw new BadRequestException('Failed to count documents');
        }
    }

    async cleanupPendingUploads(userId: string) {
        const pendingDocuments = await this.documentRepository.find({
            where: {
                userId,
                status: 'pending',
            },
            relations: ['folder', 'user'],
            order: { createdAt: 'ASC' },
        });

        if (pendingDocuments.length === 0) {
            return {
                success: true,
                cleaned: 0,
                knowledgeBaseDeleted: 0,
                storageDeleted: 0,
            };
        }

        const cleanupResult = await this.cleanupDocuments(pendingDocuments);
        return {
            success: true,
            cleaned: cleanupResult.cleaned,
            knowledgeBaseDeleted: cleanupResult.knowledgeBaseDeleted,
            storageDeleted: cleanupResult.storageDeleted,
        };
    }

    private async createPendingDocumentRecord(
        createDocumentDto: CreateDocumentDto & { userId: string },
        chunk: PreparedUploadChunk,
    ): Promise<Document> {
        const uploadResult = await this.s3Service.uploadFile(chunk.file);
        const fileExtension = chunk.file.originalname.split('.').pop()?.toLowerCase() || '';

        const document = this.documentRepository.create({
            fileName: uploadResult.fileName,
            folderId: createDocumentDto.folderId,
            userId: createDocumentDto.userId,
            fileUrl: uploadResult.fileUrl,
            fileType: fileExtension,
            fileSize: uploadResult.fileSize,
            mimeType: uploadResult.mimeType,
            // Same restrictive fallback as createWithFile. This is the path the
            // admin panel actually takes, since it always sends an agentId.
            visibility: createDocumentDto.visibility || DEFAULT_DOCUMENT_VISIBILITY,
            status: 'pending',
        });

        return this.documentRepository.save(document);
    }

    private async prepareUploadChunks(file: Express.Multer.File): Promise<PreparedUploadChunk[]> {
        const bufferedFile = this.toBufferedUploadFile(file.buffer, file.originalname, file.mimetype);

        let rawChunks: RawUploadChunk[];
        if (bufferedFile.size <= this.knowledgeBaseMaxFileSize) {
            rawChunks = [{
                buffer: bufferedFile.buffer,
                mimetype: bufferedFile.mimetype,
                extension: this.getExtensionFromFileName(bufferedFile.originalname, bufferedFile.mimetype),
                processingStrategy: 'original',
            }];
        } else if (bufferedFile.mimetype === 'application/pdf') {
            rawChunks = await this.splitPdfRecursively(bufferedFile.buffer, bufferedFile.originalname);
        } else if (bufferedFile.mimetype === 'text/plain') {
            rawChunks = this.createTextChunks(bufferedFile.buffer.toString('utf-8'), 'text-chunk');
        } else if (bufferedFile.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const extractedText = await mammoth.extractRawText({ buffer: bufferedFile.buffer });
            if (!extractedText.value.trim()) {
                throw new BadRequestException('Could not extract text from DOCX file for chunked upload');
            }
            rawChunks = this.createTextChunks(extractedText.value, 'docx-text-chunk');
        } else {
            throw new BadRequestException('Files over 15MB are only supported for PDF, TXT, and DOCX uploads');
        }

        const baseName = this.getBaseName(file.originalname);
        const totalParts = rawChunks.length;

        return rawChunks.map((chunk, index) => {
            const fileName = this.buildChunkFileName(baseName, index, totalParts, chunk.extension);
            return {
                file: this.toBufferedUploadFile(chunk.buffer, fileName, chunk.mimetype),
            };
        });
    }

    private async splitPdfRecursively(buffer: Buffer, originalFileName: string): Promise<RawUploadChunk[]> {
        if (buffer.length <= this.knowledgeBaseMaxFileSize) {
            return [{
                buffer,
                mimetype: 'application/pdf',
                extension: '.pdf',
                processingStrategy: 'split-pdf',
            }];
        }

        const pdfDocument = await PDFDocument.load(buffer);
        const pageCount = pdfDocument.getPageCount();

        if (pageCount <= 1) {
            const extractedText = await this.extractTextFromSinglePagePdf(buffer, originalFileName);
            return this.createTextChunks(extractedText, 'ocr-text');
        }

        const midpoint = Math.floor(pageCount / 2);
        if (midpoint <= 0 || midpoint >= pageCount) {
            throw new BadRequestException('Failed to split oversized PDF into smaller parts');
        }

        const leftBuffer = await this.createPdfBufferFromPageRange(pdfDocument, 0, midpoint - 1);
        const rightBuffer = await this.createPdfBufferFromPageRange(pdfDocument, midpoint, pageCount - 1);

        const leftChunks = await this.splitPdfRecursively(leftBuffer, originalFileName);
        const rightChunks = await this.splitPdfRecursively(rightBuffer, originalFileName);

        return [...leftChunks, ...rightChunks];
    }

    private async createPdfBufferFromPageRange(
        sourceDocument: PDFDocument,
        startPageIndex: number,
        endPageIndex: number,
    ): Promise<Buffer> {
        const pageIndexes: number[] = [];
        for (let index = startPageIndex; index <= endPageIndex; index++) {
            pageIndexes.push(index);
        }

        const chunkDocument = await PDFDocument.create();
        const pages = await chunkDocument.copyPages(sourceDocument, pageIndexes);
        pages.forEach((page) => chunkDocument.addPage(page));

        return Buffer.from(await chunkDocument.save());
    }

    private async extractTextFromSinglePagePdf(buffer: Buffer, originalFileName: string): Promise<string> {
        if (!this.openai) {
            throw new BadRequestException(
                `Single-page PDF chunk from ${originalFileName} is still larger than 10MB and OCR fallback is not configured`,
            );
        }

        const { pdf } = await import('pdf-to-img');
        const dataUrl = `data:application/pdf;base64,${buffer.toString('base64')}`;
        const renderedDocument = await pdf(dataUrl, { scale: 2 });
        const imageBuffer = await renderedDocument.getPage(1);

        const response = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0,
            max_tokens: 4000,
            messages: [
                {
                    role: 'system',
                    content:
                        'Extract all readable text from the provided document image. Preserve the reading order and return plain text only. Do not add commentary.',
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'Extract all readable text from this scanned document page. Preserve headings, list items, and line breaks when possible.',
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/png;base64,${imageBuffer.toString('base64')}`,
                            },
                        },
                    ],
                } as any,
            ],
        });

        const extractedText = response.choices[0]?.message?.content?.trim();
        if (!extractedText) {
            throw new BadRequestException(`OCR did not return readable text for ${originalFileName}`);
        }

        return extractedText;
    }

    private createTextChunks(text: string, processingStrategy: string): RawUploadChunk[] {
        const normalizedText = text.replace(/\r\n/g, '\n').trim();
        if (!normalizedText) {
            throw new BadRequestException('No readable text was found to create upload chunks');
        }

        const chunks: string[] = [];
        const paragraphs = normalizedText.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
        let currentChunk = '';

        for (const paragraph of paragraphs) {
            const nextChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
            if (Buffer.byteLength(nextChunk, 'utf-8') <= this.textChunkTargetSize) {
                currentChunk = nextChunk;
                continue;
            }

            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = '';
            }

            if (Buffer.byteLength(paragraph, 'utf-8') <= this.textChunkTargetSize) {
                currentChunk = paragraph;
                continue;
            }

            chunks.push(...this.splitLargeTextBlock(paragraph));
        }

        if (currentChunk) {
            chunks.push(currentChunk);
        }

        return chunks.map((chunk) => ({
            buffer: Buffer.from(chunk, 'utf-8'),
            mimetype: 'text/plain',
            extension: '.txt',
            processingStrategy,
        }));
    }

    private splitLargeTextBlock(text: string): string[] {
        const chunks: string[] = [];
        let remainingText = text;

        while (remainingText) {
            if (Buffer.byteLength(remainingText, 'utf-8') <= this.textChunkTargetSize) {
                chunks.push(remainingText);
                break;
            }

            const prefix = this.takeLargestPrefixByBytes(remainingText, this.textChunkTargetSize);
            const splitIndex = this.findBetterSplitIndex(prefix);
            const chunk = prefix.slice(0, splitIndex).trim();

            if (!chunk) {
                throw new BadRequestException('Failed to split oversized text block into smaller chunks');
            }

            chunks.push(chunk);
            remainingText = remainingText.slice(chunk.length).trim();
        }

        return chunks;
    }

    private takeLargestPrefixByBytes(text: string, maxBytes: number): string {
        let low = 0;
        let high = text.length;
        let best = '';

        while (low <= high) {
            const middle = Math.floor((low + high) / 2);
            const candidate = text.slice(0, middle);
            const size = Buffer.byteLength(candidate, 'utf-8');

            if (size <= maxBytes) {
                best = candidate;
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }

        return best;
    }

    private findBetterSplitIndex(prefix: string): number {
        const lineBreakIndex = prefix.lastIndexOf('\n');
        if (lineBreakIndex > prefix.length / 2) {
            return lineBreakIndex;
        }

        const sentenceBreakIndex = Math.max(prefix.lastIndexOf('. '), prefix.lastIndexOf('? '), prefix.lastIndexOf('! '));
        if (sentenceBreakIndex > prefix.length / 2) {
            return sentenceBreakIndex + 1;
        }

        return prefix.length;
    }

    private async uploadChunkToKnowledgeBase(file: BufferedUploadFile) {
        if (!this.knowledgeBaseHelper || !this.elevenLabsClient) {
            throw new BadRequestException('Knowledge base upload is not configured');
        }

        return this.knowledgeBaseHelper.uploadFile(file, this.elevenLabsClient);
    }

    private async uploadChunkWithOcrFallback(file: BufferedUploadFile) {
        try {
            return await this.uploadChunkToKnowledgeBase(file);
        } catch (uploadError: any) {
            if (file.mimetype !== 'application/pdf') {
                throw uploadError;
            }

            this.logger.warn(
                `ElevenLabs upload failed for ${file.originalname}: ${uploadError?.message || uploadError}. Attempting OCR fallback.`,
            );

            const extractedText = await this.runPdfOcrFallback(file);
            const txtFile = this.buildTextUploadFile(extractedText, file.originalname);
            return this.uploadChunkToKnowledgeBase(txtFile);
        }
    }

    private async runPdfOcrFallback(file: BufferedUploadFile): Promise<string> {
        if (this.textractOcrService.isConfigured()) {
            try {
                const text = await this.textractOcrService.extractTextFromPdf(file.buffer, file.originalname);
                if (text && text.trim().length > 0) {
                    return text;
                }
            } catch {
                // fall through to OpenAI
            }
        }

        try {
            const text = await this.extractTextFromMultiPagePdfWithOpenAI(file.buffer, file.originalname);
            if (text && text.trim().length > 0) {
                return text;
            }
            throw new Error('OpenAI OCR returned empty text');
        } catch (openaiError: any) {
            throw new BadRequestException(
                `File "${file.originalname}" appears to be unreadable. ElevenLabs, Textract, and OpenAI OCR all failed. Please upload a different file.`,
            );
        }
    }

    private async extractTextFromMultiPagePdfWithOpenAI(buffer: Buffer, originalFileName: string): Promise<string> {
        if (!this.openai) {
            throw new BadRequestException(
                `OpenAI OCR fallback is not configured for ${originalFileName}`,
            );
        }

        const { pdf } = await import('pdf-to-img');
        const dataUrl = `data:application/pdf;base64,${buffer.toString('base64')}`;
        const renderedDocument = await pdf(dataUrl, { scale: 2 });
        const pageCount = renderedDocument.length;

        const pageTexts: string[] = [];

        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
            const imageBuffer = await renderedDocument.getPage(pageNum);

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                temperature: 0,
                max_tokens: 4000,
                messages: [
                    {
                        role: 'system',
                        content:
                            'Extract all readable text from the provided document image. Preserve the reading order and return plain text only. Do not add commentary.',
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Extract all readable text from this scanned document page. Preserve headings, list items, and line breaks when possible.',
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/png;base64,${imageBuffer.toString('base64')}`,
                                },
                            },
                        ],
                    } as any,
                ],
            });

            const pageText = response.choices[0]?.message?.content?.trim();
            if (pageText) {
                pageTexts.push(pageText);
            }
        }

        return pageTexts.join('\n\n').trim();
    }

    private buildTextUploadFile(text: string, originalFileName: string): BufferedUploadFile {
        const baseName = this.getBaseName(originalFileName);
        const txtFileName = `${baseName}.txt`;
        const buffer = Buffer.from(text, 'utf-8');
        return this.toBufferedUploadFile(buffer, txtFileName, 'text/plain');
    }

    private async syncStoredFileWithKnowledgeBaseDocument(
        pendingDocument: Document,
        file: BufferedUploadFile,
        uploadedDocument: { id: string; name: string; type?: string },
    ): Promise<void> {
        if (!this.knowledgeBaseHelper) {
            throw new BadRequestException('Knowledge base upload is not configured');
        }

        const fetchedContent = await this.knowledgeBaseHelper.getDocumentDetails(uploadedDocument.id);
        this.logger.log(
            `[KB_CONTENT] documentId=${uploadedDocument.id} name=${fetchedContent.name || 'NA'} url=${fetchedContent.url || 'NA'} extracted_inner_html_length=${fetchedContent.extractedInnerHtml?.length || 0}`,
        );
        await this.knowledgeBaseHelper.uploadDocumentDetailsToInternalApi({
            documentId: uploadedDocument.id,
            filename: fetchedContent.filename || file.originalname,
            name: fetchedContent.name || uploadedDocument.name || file.originalname,
            extractedInnerHtml: fetchedContent.extractedInnerHtml,
        });

        const targetFileName = this.buildKnowledgeBaseStorageFileName(
            fetchedContent.name || uploadedDocument.name || file.originalname,
            uploadedDocument.id,
            this.getExtensionFromFileName(file.originalname, file.mimetype),
        );

        const renamedUploadResult = await this.s3Service.uploadFileWithCustomName(file, targetFileName);
        const previousFileUrl = pendingDocument.fileUrl;

        pendingDocument.fileUrl = renamedUploadResult.fileUrl;
        pendingDocument.fileName = renamedUploadResult.fileName;
        pendingDocument.fileSize = renamedUploadResult.fileSize;
        pendingDocument.mimeType = renamedUploadResult.mimeType;
        await this.saveKnowledgeBaseSource({
            documentId: uploadedDocument.id,
            sourceType: 'file',
            s3Key: renamedUploadResult.fileUrl,
            originalUrl: null,
        });

        if (previousFileUrl && previousFileUrl !== renamedUploadResult.fileUrl) {
            await this.s3Service.deleteFile(previousFileUrl);
        }
    }

    private buildKnowledgeBaseStorageFileName(name: string, documentId: string, fallbackExtension: string): string {
        const sanitizedBaseName = name
            .replace(/[\/\\]/g, '-')
            .replace(/\s+/g, ' ')
            .trim();
        const hasExtension = /\.[a-z0-9]+$/i.test(sanitizedBaseName);
        const extension = hasExtension ? '' : fallbackExtension;
        return `${sanitizedBaseName}__${documentId}${extension}`;
    }

    private async syncStoredFileWithKnowledgeBaseDocumentSafely(
        pendingDocument: Document,
        file: BufferedUploadFile,
        uploadedDocument: { id: string; name: string; type?: string },
    ): Promise<void> {
        try {
            await this.syncStoredFileWithKnowledgeBaseDocument(pendingDocument, file, uploadedDocument);
            await this.documentRepository.save(pendingDocument);
        } catch (error: any) {
            this.logger.warn(
                `[KB_POST_UPLOAD_WARNING] documentId=${uploadedDocument.id} error=${error?.message || String(error)}`,
            );
        }
    }

    private async attachDocumentsToAgent(agentId: string, uploadedDocuments: Array<{ id: string; name: string }>) {
        if (!this.knowledgeBaseHelper) {
            throw new BadRequestException('Knowledge base upload is not configured');
        }

        if (uploadedDocuments.length === 0) {
            return;
        }

        const existingAgent = await this.knowledgeBaseHelper.getAgentConfig(agentId);
        const existingKnowledgeBase = existingAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];
        const existingIds = new Set(existingKnowledgeBase.map((document: any) => document.id));
        const newItems = uploadedDocuments.filter((document) => !existingIds.has(document.id));

        if (newItems.length === 0) {
            return;
        }

        const combinedKnowledgeBase = [
            ...existingKnowledgeBase,
            ...newItems.map((document) => ({ type: 'file', id: document.id, name: document.name })),
        ];

        const ragConfig = existingAgent?.conversation_config?.agent?.prompt?.rag || {
            enabled: true,
            embedding_model: 'e5_mistral_7b_instruct',
            max_vector_distance: 0.6,
            max_documents_length: 50000,
            max_retrieved_rag_chunks_count: 20,
        };

        await this.knowledgeBaseHelper.updateAgentKnowledgeBase(agentId, combinedKnowledgeBase, ragConfig);

        // Mirror the attach onto the chatbot agent so it shares the same knowledge
        // base as the receptionist. Best-effort — logged + swallowed on failure so
        // the receptionist attach above never regresses.
        if (this.chatbotAgentId && this.chatbotAgentId !== agentId) {
            try {
                const chatbotAgent = await this.knowledgeBaseHelper.getAgentConfig(this.chatbotAgentId);
                const chatbotKnowledgeBase = chatbotAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];
                const chatbotExistingIds = new Set(chatbotKnowledgeBase.map((document: any) => document.id));
                const chatbotNewItems = uploadedDocuments.filter((document) => !chatbotExistingIds.has(document.id));
                if (chatbotNewItems.length > 0) {
                    const chatbotCombined = [
                        ...chatbotKnowledgeBase,
                        ...chatbotNewItems.map((document) => ({ type: 'file', id: document.id, name: document.name })),
                    ];
                    const chatbotRagConfig = chatbotAgent?.conversation_config?.agent?.prompt?.rag || {
                        enabled: true,
                        embedding_model: 'e5_mistral_7b_instruct',
                        max_vector_distance: 0.6,
                        max_documents_length: 50000,
                        max_retrieved_rag_chunks_count: 20,
                    };
                    await this.knowledgeBaseHelper.updateAgentKnowledgeBase(this.chatbotAgentId, chatbotCombined, chatbotRagConfig);
                }
            } catch (error: any) {
                this.logger.warn(`Failed to mirror document attach to chatbot agent ${this.chatbotAgentId}: ${error.message}`);
            }
        }
    }

    private async cleanupDocuments(documents: Document[]) {
        let knowledgeBaseDeleted = 0;
        let storageDeleted = 0;
        const documentsWithExternalIds = documents.filter((document) => document.documentId);
        const documentIds = documentsWithExternalIds
            .map((document) => document.documentId)
            .filter(Boolean) as string[];

        if (documentIds.length > 0) {
            await this.removeDocumentsFromAgentIfPresent(documentIds);
        }

        for (const document of documentsWithExternalIds) {
            try {
                if (this.knowledgeBaseHelper) {
                    await this.knowledgeBaseHelper.deleteDocumentFromKnowledgeBase(document.documentId);
                    knowledgeBaseDeleted++;
                }
            } catch (error: any) {
                this.logger.warn(`Failed to delete knowledge base document ${document.documentId}: ${error.message}`);
            }
        }

        for (const documentId of documentIds) {
            try {
                await this.knowledgeBaseSourceRepository.delete({ documentId });
            } catch (error: any) {
                this.logger.warn(`Failed to delete knowledge base source mapping for ${documentId}: ${error.message}`);
            }
        }

        for (const document of documents) {
            try {
                await this.s3Service.deleteFile(document.fileUrl);
                storageDeleted++;
            } catch (error: any) {
                this.logger.warn(`Failed to delete S3 file ${document.fileUrl}: ${error.message}`);
            }
        }

        await this.documentRepository.remove(documents);

        return {
            cleaned: documents.length,
            knowledgeBaseDeleted,
            storageDeleted,
        };
    }

    private async removeDocumentsFromAgentIfPresent(documentIds: string[]) {
        if (!this.knowledgeBaseHelper || documentIds.length === 0) {
            return;
        }

        // Detach from BOTH the receptionist and the chatbot agent so they stay in
        // sync. Each agent is best-effort and isolated — a failure on one is logged
        // and does not block the other.
        const agentIds = [this.defaultAgentId, this.chatbotAgentId].filter(Boolean);
        const documentIdSet = new Set(documentIds);

        for (const agentId of agentIds) {
            try {
                const existingAgent = await this.knowledgeBaseHelper.getAgentConfig(agentId);
                const existingKnowledgeBase = existingAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];
                const updatedKnowledgeBase = existingKnowledgeBase.filter((document: any) => !documentIdSet.has(document.id));

                if (updatedKnowledgeBase.length === existingKnowledgeBase.length) {
                    continue;
                }

                const ragConfig = existingAgent?.conversation_config?.agent?.prompt?.rag || {};
                await this.knowledgeBaseHelper.updateAgentKnowledgeBase(agentId, updatedKnowledgeBase, ragConfig);
            } catch (error: any) {
                this.logger.warn(`Failed to remove documents from agent ${agentId}: ${error.message}`);
            }
        }
    }

    private ensureKnowledgeBaseConfigured() {
        if (!this.knowledgeBaseHelper || !this.elevenLabsClient) {
            throw new BadRequestException('Knowledge base upload is not configured');
        }
    }

    private toBufferedUploadFile(buffer: Buffer, originalname: string, mimetype: string): BufferedUploadFile {
        return {
            fieldname: 'file',
            originalname,
            encoding: '7bit',
            mimetype,
            size: buffer.length,
            buffer,
            stream: undefined as any,
            destination: '',
            filename: '',
            path: '',
        };
    }

    private getBaseName(fileName: string): string {
        const lastDotIndex = fileName.lastIndexOf('.');
        return lastDotIndex === -1 ? fileName : fileName.slice(0, lastDotIndex);
    }

    private getExtensionFromFileName(fileName: string, mimetype: string): string {
        const lastDotIndex = fileName.lastIndexOf('.');
        if (lastDotIndex !== -1) {
            return fileName.slice(lastDotIndex).toLowerCase();
        }

        if (mimetype === 'application/pdf') return '.pdf';
        if (mimetype === 'text/plain') return '.txt';
        if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return '.docx';
        return '.bin';
    }

    private buildChunkFileName(baseName: string, index: number, totalParts: number, extension: string): string {
        if (totalParts <= 1) {
            return `${baseName}${extension}`;
        }

        if (index === 0) {
            return `${baseName}${extension}`;
        }

        return `${baseName}-${index}${extension}`;
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
}