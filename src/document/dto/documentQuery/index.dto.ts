import { IsUUID, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryDocumentDto {
    @ApiPropertyOptional({ description: 'Filter by document ID' })
    @IsString()
    @IsOptional()
    documentId?: string;

    @ApiPropertyOptional({ description: 'Filter by folder ID' })
    @IsUUID()
    @IsOptional()
    folderId?: string;

    @ApiPropertyOptional({ description: 'Filter by user ID' })
    @IsUUID()
    @IsOptional()
    userId?: string;

    @ApiPropertyOptional({ description: 'Filter by file type' })
    @IsString()
    @IsOptional()
    fileType?: string;
}