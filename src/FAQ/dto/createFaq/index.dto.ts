import { IsString, IsNotEmpty, IsUUID, IsOptional } from 'class-validator';

export class CreateFaqDto {
    @IsString()
    @IsNotEmpty()
    question: string;

    @IsString()
    @IsNotEmpty()
    answer: string;

    @IsUUID()
    @IsNotEmpty()
    folderId: string;

    @IsOptional()
    @IsString()
    documentId?: string;
}