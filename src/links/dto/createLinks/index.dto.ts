import { IsUrl, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLinkDto {
    @IsNotEmpty()
    @IsUrl()
    url: string;

    @IsOptional()
    @IsString()
    documentId?: string;
}