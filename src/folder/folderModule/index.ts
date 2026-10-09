import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FolderService } from '@/folder/folderService';
import { FolderController } from '@/folder/folderController';
import { Folder } from '@/schema';
import { DocumentModule } from '@/document/documentModule';
import { KnowledgeBaseModule } from '@/knowledgeBase/knowledgeBaseModule';
import { FaqModule } from '@/FAQ/faqModule';

@Module({
    imports: [
        TypeOrmModule.forFeature([Folder]),
        DocumentModule,
        KnowledgeBaseModule,
        FaqModule,
    ],
    controllers: [FolderController],
    providers: [FolderService],
    exports: [FolderService],
})
export class FolderModule {}