import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DocumentService } from '@/document/documentService';
import { DocumentController } from '@/document/documentController';
import { S3Service } from '@/helper/s3-bucket';
import { TextractOcrService } from '@/helper/textract-ocr';
import { Document, KnowledgeBaseSource } from '@/schema';

@Module({
    imports: [TypeOrmModule.forFeature([Document, KnowledgeBaseSource]), ConfigModule],
    controllers: [DocumentController],
    providers: [DocumentService, S3Service, TextractOcrService],
    exports: [DocumentService, S3Service],
})
export class DocumentModule { }