import { IsOptional, IsString, IsIn, IsUUID } from 'class-validator';

export class FolderQueryDto {
    @IsOptional()
    @IsString()
    @IsIn(['document', 'faq'])
    section?: 'document' | 'faq';

    @IsOptional()
    @IsUUID('4')
    parentId?: string;
}