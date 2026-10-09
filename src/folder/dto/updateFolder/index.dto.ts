import { PartialType, PickType } from '@nestjs/swagger';
import { CreateFolderDto } from '@/folder/dto';

export class UpdateFolderDto extends PartialType(
    PickType(CreateFolderDto, ['folderName'] as const)
) {}