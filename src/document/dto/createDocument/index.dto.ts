import { IsString, IsUUID, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentVisibility } from '@/types/document';

export class CreateDocumentDto {
    @ApiPropertyOptional({
        description: 'External service document ID (e.g., ElevenLabs document ID)'
    })
    @IsString()
    @IsOptional()
    documentId?: string;

    @ApiPropertyOptional({ description: 'Name/title of the document (optional, will use uploaded filename if not provided)' })
    @IsString()
    @IsOptional()
    fileName?: string;

    @ApiProperty({ description: 'Folder ID where document will be stored', format: 'uuid' })
    @IsUUID()
    @IsNotEmpty()
    folderId: string;

    @ApiPropertyOptional({
        description: 'Optional agent ID to trigger knowledge base upload orchestration'
    })
    @IsString()
    @IsOptional()
    agentId?: string;

    /**
     * Optional so existing callers keep working, but omitting it does not mean
     * "unrestricted" — the service falls back to the most restrictive value.
     */
    @ApiPropertyOptional({
        description: 'Who may be sent this document. Defaults to the most restrictive value (site) when omitted.',
        enum: DocumentVisibility,
        default: DocumentVisibility.SITE,
    })
    @IsEnum(DocumentVisibility)
    @IsOptional()
    visibility?: DocumentVisibility;
}