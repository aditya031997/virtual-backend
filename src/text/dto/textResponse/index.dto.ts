import { ApiProperty } from '@nestjs/swagger';

export class TextResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    content: string;

    @ApiProperty()
    userId: string;

    @ApiProperty({ required: false })
    documentId?: string;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}