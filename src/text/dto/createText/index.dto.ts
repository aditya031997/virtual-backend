import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTextDto {
    @ApiProperty({ description: 'Text content' })
    @IsNotEmpty()
    @IsString()
    content: string;

    @ApiProperty({ description: 'Document ID', required: false })
    @IsOptional()
    @IsString()
    documentId?: string;
}