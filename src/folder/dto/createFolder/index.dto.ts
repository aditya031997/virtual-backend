import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateFolderDto {
    @IsString()
    @IsNotEmpty({ message: 'Folder name is required' })
    @MaxLength(100, { message: 'Folder name must not exceed 100 characters' })
    @Matches(/^[a-zA-Z0-9\s\-_]+$/, { 
        message: 'Folder name can only contain letters, numbers, spaces, hyphens and underscores' 
    })
    folderName: string;

    @IsString()
    @IsNotEmpty({ message: 'Section is required' })
    @MaxLength(100, { message: 'Section must not exceed 100 characters' })
    section: string;

    @IsOptional()
    @IsUUID('4', { message: 'Parent ID must be a valid UUID' })
    @Transform(({ value }) => value === '' || value === 'null' ? null : value)
    parentId?: string | null;
}