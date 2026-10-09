import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    HttpCode,
    HttpStatus,
    UseGuards,
    Req,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentService } from '@/document/documentService';
import { CreateDocumentDto, UpdateDocumentDto, QueryDocumentDto } from '@/document/dto';
import { Document } from '@/schema';
import { AuthGuard } from '@/common/guards/auth.guard';
import type { IAuthenticatedRequest ,IDocumentApiResponse} from '@/types';


@Controller('documents')
@UseGuards(AuthGuard)
export class DocumentController {
    // Allowed file types
    private readonly ALLOWED_MIME_TYPES = [
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    // 20MB in bytes
    private readonly MAX_FILE_SIZE = 20 * 1024 * 1024;

    constructor(private readonly documentService: DocumentService) { }

    /**
     * Upload and create document
     * Can optionally include documentId from external service (e.g., ElevenLabs)
     */
    @Post('upload')
    @UseInterceptors(
        FileInterceptor('file', {
            limits: {
                fileSize: 20 * 1024 * 1024, // 20MB
            },
        })
    )
    async uploadDocument(
        @UploadedFile() file: Express.Multer.File,
        @Body() createDocumentDto: CreateDocumentDto,
        @Req() req: IAuthenticatedRequest,
    ): Promise<IDocumentApiResponse<Document | Document[]>> {
        // Validate file exists
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        // Validate file type
        if (!this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            throw new BadRequestException(
                'Invalid file type. Only PDF, TXT, DOC, and DOCX files are allowed'
            );
        }

        // Validate file size
        if (file.size > this.MAX_FILE_SIZE) {
            throw new BadRequestException('File size exceeds 20MB limit');
        }

        const dataWithUserId = {
            ...createDocumentDto,
            userId: req.user.sub,
        };

        const document = await this.documentService.createWithFile(dataWithUserId, file);
        const uploadedCount = Array.isArray(document) ? document.length : 1;

        return {
            success: true,
            message: uploadedCount > 1
                ? `Document processed into ${uploadedCount} upload part(s) successfully`
                : 'Document uploaded and created successfully',
            data: document,
        };
    }

    @Post('cleanup-pending')
    async cleanupPendingUploads(
        @Req() req: IAuthenticatedRequest,
    ): Promise<IDocumentApiResponse<{ cleaned: number; knowledgeBaseDeleted: number; storageDeleted: number }>> {
        const result = await this.documentService.cleanupPendingUploads(req.user.sub);

        return {
            success: true,
            message: `Cleaned ${result.cleaned} stale pending document upload(s)`,
            data: {
                cleaned: result.cleaned,
                knowledgeBaseDeleted: result.knowledgeBaseDeleted,
                storageDeleted: result.storageDeleted,
            },
        };
    }

    /**
     * Get all documents with optional filters
     * Query params: folderId, userId, fileType, documentId
     * Example: GET /documents/allDocuments?folderId=xxx&documentId=3lpMmN4oubGTBaOrj87I
     */
    @Get('allDocuments')
    async findAll(
        @Query() query: QueryDocumentDto
    ): Promise<IDocumentApiResponse<Document[]>> {
        const documents = await this.documentService.findAll(query);
        
        return {
            success: true,
            message: query.folderId 
                ? `Retrieved ${documents.length} document(s) from folder`
                : `Retrieved ${documents.length} document(s) successfully`,
            data: documents,
            count: documents.length,
        };
    }

    /**
     * Get all documents in a specific folder
     * Dedicated endpoint for folder-based queries
     * Example: GET /documents/folder/abc-123-folder-id
     */
    @Get('folder/:folderId')
    async findByFolder(
        @Param('folderId') folderId: string
    ): Promise<IDocumentApiResponse<Document[]>> {
        const documents = await this.documentService.findByFolderId(folderId);
        
        return {
            success: true,
            message: `Retrieved ${documents.length} document(s) from folder`,
            data: documents,
            count: documents.length,
        };
    }

    /**
     * Get document count for a specific folder
     * Example: GET /documents/folder/abc-123-folder-id/count
     */
    @Get('folder/:folderId/count')
    async getDocumentCount(
        @Param('folderId') folderId: string
    ): Promise<IDocumentApiResponse<{ count: number }>> {
        const count = await this.documentService.getDocumentCountByFolder(folderId);
        
        return {
            success: true,
            message: `Folder has ${count} document(s)`,
            data: { count },
        };
    }

    /**
     * Get document by ID
     */
    @Get('getById/:id')
    async findOne(@Param('id') id: string): Promise<IDocumentApiResponse<Document>> {
        const document = await this.documentService.findOne(id);
        return {
            success: true,
            message: 'Document retrieved successfully',
            data: document,
        };
    }

    /**
     * Get document by external documentId (e.g., ElevenLabs ID)
     * Example: GET /documents/getByDocumentId/3lpMmN4oubGTBaOrj87I
     */
    @Get('getByDocumentId/:documentId')
    async findByDocumentId(@Param('documentId') documentId: string): Promise<IDocumentApiResponse<Document>> {
        const document = await this.documentService.findByDocumentId(documentId);
        return {
            success: true,
            message: 'Document retrieved successfully',
            data: document,
        };
    }

    /**
     * Get presigned download URL for a document
     */
    @Get('download/:id')
    async getDownloadUrl(
        @Param('id') id: string
    ): Promise<IDocumentApiResponse<{ downloadUrl: string; fileName: string }>> {
        const result = await this.documentService.getDownloadUrl(id);
        return {
            success: true,
            message: 'Download URL generated successfully (expires in 1 hour)',
            data: result,
        };
    }

    /**
     * Update document metadata (fileName, folderId, and documentId)
     * Use this to add/update the ElevenLabs document ID after upload
     */
    @Patch('update/:id')
    async update(
        @Param('id') id: string,
        @Body() updateDocumentDto: UpdateDocumentDto,
    ): Promise<IDocumentApiResponse<Document>> {
        const document = await this.documentService.update(id, updateDocumentDto);
        return {
            success: true,
            message: 'Document updated successfully',
            data: document,
        };
    }

    /**
     * Delete document (from both S3 and database)
     */
    @Delete('delete/:id')
    @HttpCode(HttpStatus.OK)
    async remove(@Param('id') id: string): Promise<IDocumentApiResponse<null>> {
        await this.documentService.remove(id);
        return {
            success: true,
            message: 'Document deleted successfully from storage and database',
            data: null,
        };
    }
}