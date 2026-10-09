import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Folder } from '@/schema';
import { CreateFolderDto, UpdateFolderDto, FolderQueryDto } from '@/folder/dto';
import { IFolder } from '@/types';
import { DocumentService } from '@/document/documentService';
import { KnowledgeBaseService } from '@/knowledgeBase/knowledgeBaseService';
import { FaqService } from '@/FAQ/faqService';

@Injectable()
export class FolderService {
    private readonly logger = new Logger(FolderService.name);

    constructor(
        @InjectRepository(Folder)
        private readonly folderRepository: Repository<Folder>,
        private readonly documentService: DocumentService,
        private readonly knowledgeBaseService: KnowledgeBaseService,
        private readonly faqService: FaqService,
    ) { }

   async create(createFolderDto: CreateFolderDto, userId: string): Promise<IFolder> {
    const { folderName, section, parentId } = createFolderDto;

    // Trim and validate folder name
    const trimmedFolderName = folderName.trim();
    
    if (!trimmedFolderName) {
        throw new BadRequestException('Folder name cannot be empty');
    }

    // Build where condition for duplicate check
    const whereCondition: {
        folderName: string;
        section: string;
        userId: string;
        parentId: string | ReturnType<typeof IsNull>;
    } = {
        folderName: trimmedFolderName,
        section,
        userId,
        parentId: parentId ? parentId : IsNull(),
    };

    const existingFolder = await this.folderRepository.findOne({
        where: whereCondition,
    });

    if (existingFolder) {
        const location = parentId 
            ? 'this folder' 
            : `the root of ${section}`;
        
        throw new ConflictException(
            `A folder named "${trimmedFolderName}" already exists. Please choose a different name.`
        );
    }

    // If parentId provided, verify parent folder exists
    if (parentId) {
        const parentFolder = await this.folderRepository.findOne({
            where: { id: parentId, userId },
        });

        if (!parentFolder) {
            throw new NotFoundException('Parent folder not found. Please select a valid parent folder.');
        }

        if (parentFolder.section !== section) {
            throw new BadRequestException(
                `Cannot create folder here. The parent folder belongs to "${parentFolder.section}" section, but you're trying to create in "${section}" section.`
            );
        }
    }

    try {
        // Use save() directly instead of create()
        const folder = await this.folderRepository.save({
            folderName: trimmedFolderName,
            section,
            userId,
            parentId: parentId ?? null,
        });

        return folder;
    } catch (error) {
        // Handle database-level unique constraint violations
        if (error.code === '23505') {
            const errorDetail = error.detail || '';
            
            if (errorDetail.toLowerCase().includes('foldername')) {
                throw new ConflictException(
                    `A folder with this name already exists. Please choose a different name.`
                );
            }
            throw new ConflictException('A folder with these details already exists.');
        }
        
        // Re-throw other errors
        throw error;
    }
}

async findAll(userId: string, query: FolderQueryDto): Promise<IFolder[]> {
    const { section, parentId } = query;

    const queryBuilder = this.folderRepository
        .createQueryBuilder('folder')
        .where('folder.userId = :userId', { userId });

    // Filter by section (document or faq)
    if (section) {
        queryBuilder.andWhere('folder.section = :section', { section });
    }

    // Filter by parentId if provided
    if (parentId !== undefined) {
        if (parentId === null || parentId === 'null') {
            queryBuilder.andWhere('folder.parentId IS NULL');
        } else {
            queryBuilder.andWhere('folder.parentId = :parentId', { parentId });
        }
    }

    queryBuilder.orderBy('folder.createdAt', 'DESC');

    return await queryBuilder.getMany();
}

    async findOne(id: string, userId: string): Promise<IFolder> {
        const folder = await this.folderRepository.findOne({
            where: { id, userId },
        });

        if (!folder) {
            throw new NotFoundException('Folder not found');
        }

        return folder;
    }

    async update(
        id: string,
        updateFolderDto: UpdateFolderDto,
        userId: string,
    ): Promise<IFolder> {
        const folder = await this.findOne(id, userId);

        if (updateFolderDto.folderName) {
            const whereCondition: {
                folderName: string;
                section: string;
                userId: string;
                parentId: string | ReturnType<typeof IsNull>;
            } = {
                folderName: updateFolderDto.folderName,
                section: folder.section,
                userId,
                parentId: folder.parentId ? folder.parentId : IsNull(),
            };

            const existingFolder = await this.folderRepository.findOne({
                where: whereCondition,
            });

            if (existingFolder && existingFolder.id !== id) {
                throw new ConflictException(
                    `Folder with name "${updateFolderDto.folderName}" already exists in this location`
                );
            }
        }

        Object.assign(folder, updateFolderDto);
        return await this.folderRepository.save(folder);
    }

    async remove(id: string, userId: string): Promise<void> {
        const subfolders = await this.folderRepository.count({
            where: { parentId: id, userId },
        });

        if (subfolders > 0) {
            throw new BadRequestException(
                'Cannot delete folder that contains subfolders. Please delete subfolders first.'
            );
        }
        
        await this.folderRepository.delete({ id, userId });
    }

    /**
     * Delete folder and all documents and FAQs inside it
     * - Deletes documents from ElevenLabs knowledge base
     * - Deletes documents from S3 and database
     * - Deletes FAQs from ElevenLabs knowledge base (if they have documentId)
     * - Deletes FAQs from database
     * - Finally deletes the folder itself
     */
    async removeWithDocuments(id: string, userId: string): Promise<{
        success: boolean;
        message: string;
        deletedDocuments: number;
        deletedFaqs: number;
        deletedFromKnowledgeBase: number;
        errors?: string[];
    }> {
        const folder = await this.findOne(id, userId);
        
        // Check for subfolders
        const subfolders = await this.folderRepository.count({
            where: { parentId: id, userId },
        });

        if (subfolders > 0) {
            throw new BadRequestException(
                'Cannot delete folder that contains subfolders. Please delete subfolders first.'
            );
        }

        const errors: string[] = [];
        let deletedFromKnowledgeBaseCount = 0;
        let deletedDocumentsCount = 0;
        let deletedFaqsCount = 0;

        // Find all documents in this folder
        const documents = await this.documentService.findByFolderId(id);
        this.logger.log(`Found ${documents.length} document(s) in folder ${id}`);

        // Step 1: Delete all documents from ElevenLabs first
        // Collect all documentIds that need to be deleted from ElevenLabs
        const documentIdsToDelete = documents
            .filter(doc => doc.documentId && doc.documentId.trim())
            .map(doc => doc.documentId);

        this.logger.log(`Deleting ${documentIdsToDelete.length} document(s) from ElevenLabs knowledge base`);
        
        // Delete all documents from ElevenLabs (remove from agent and knowledge base)
        for (const documentId of documentIdsToDelete) {
            try {
                this.logger.log(`Deleting document ${documentId} from ElevenLabs (removing from agent and knowledge base)`);
                // Use removeDocumentAndDeleteFromKnowledgeBase to properly remove from agent first, then delete from knowledge base
                await this.knowledgeBaseService.removeDocumentAndDeleteFromKnowledgeBase(documentId);
                deletedFromKnowledgeBaseCount++;
                this.logger.log(`Successfully deleted document ${documentId} from ElevenLabs`);
            } catch (error: any) {
                const errorMsg = `Failed to delete document ${documentId} from ElevenLabs: ${error.message}`;
                this.logger.error(errorMsg);
                errors.push(errorMsg);
                // Continue with other documents even if this one fails
            }
        }

        // Step 2: Delete all documents from S3 and database
        for (const document of documents) {
            try {
                this.logger.log(`Deleting document ${document.id} from database and S3`);
                await this.documentService.remove(document.id);
                deletedDocumentsCount++;
                this.logger.log(`Successfully deleted document ${document.id} from database and S3`);
            } catch (error: any) {
                const errorMsg = `Failed to delete document ${document.id} from database/S3: ${error.message}`;
                this.logger.error(errorMsg);
                errors.push(errorMsg);
            }
        }

        // Find all FAQs in this folder
        const faqs = await this.faqService.findByFolder(id, userId);
        this.logger.log(`Found ${faqs.length} FAQ(s) in folder ${id}`);

        // Delete each FAQ
        for (const faq of faqs) {
            try {
                // If FAQ has an ElevenLabs documentId, delete from knowledge base first
                // Check if documentId exists and is not empty
                if (faq.documentId && faq.documentId.trim()) {
                    try {
                        this.logger.log(`Deleting FAQ document ${faq.documentId} from ElevenLabs (removing from agent and knowledge base)`);
                        // Use removeDocumentAndDeleteFromKnowledgeBase to properly remove from agent first, then delete from knowledge base
                        await this.knowledgeBaseService.removeDocumentAndDeleteFromKnowledgeBase(faq.documentId);
                        deletedFromKnowledgeBaseCount++;
                        this.logger.log(`Successfully deleted FAQ document ${faq.documentId} from ElevenLabs`);
                    } catch (error: any) {
                        const errorMsg = `Failed to delete FAQ document ${faq.documentId} from ElevenLabs: ${error.message}`;
                        this.logger.error(errorMsg);
                        errors.push(errorMsg);
                        // Continue with database deletion even if ElevenLabs deletion fails
                    }
                } else {
                    this.logger.warn(`FAQ ${faq.id} does not have a documentId, skipping ElevenLabs deletion`);
                }

                // Delete FAQ from database
                try {
                    this.logger.log(`Deleting FAQ ${faq.id} from database`);
                    await this.faqService.delete(faq.id, userId);
                    deletedFaqsCount++;
                    this.logger.log(`Successfully deleted FAQ ${faq.id} from database`);
                } catch (error: any) {
                    const errorMsg = `Failed to delete FAQ ${faq.id} from database: ${error.message}`;
                    this.logger.error(errorMsg);
                    errors.push(errorMsg);
                }
            } catch (error: any) {
                const errorMsg = `Error processing FAQ ${faq.id}: ${error.message}`;
                this.logger.error(errorMsg);
                errors.push(errorMsg);
            }
        }

        // Finally, delete the folder itself
        try {
            await this.folderRepository.delete({ id, userId });
            this.logger.log(`Successfully deleted folder ${id}`);
        } catch (error: any) {
            const errorMsg = `Failed to delete folder: ${error.message}`;
            this.logger.error(errorMsg);
            throw new BadRequestException(errorMsg);
        }

        const totalItems = deletedDocumentsCount + deletedFaqsCount;
        return {
            success: true,
            message: `Folder and ${totalItems} item(s) (${deletedDocumentsCount} document(s), ${deletedFaqsCount} FAQ(s)) deleted successfully`,
            deletedDocuments: deletedDocumentsCount,
            deletedFaqs: deletedFaqsCount,
            deletedFromKnowledgeBase: deletedFromKnowledgeBaseCount,
            ...(errors.length > 0 && { errors }),
        };
    }
}