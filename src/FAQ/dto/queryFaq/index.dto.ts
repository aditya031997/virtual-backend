import { IsOptional, IsUUID, IsString } from 'class-validator';

export class FaqQueryDto {
    @IsOptional()
    @IsUUID()
    folderId?: string;

    @IsOptional()
    @IsString()
    documentId?: string;

    @IsOptional()
    @IsString()
    search?: string;
}