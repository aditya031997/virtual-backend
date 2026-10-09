import { PartialType } from '@nestjs/swagger';
import { CreateDocumentDto } from '@/document/dto';

export class UpdateDocumentDto extends PartialType(CreateDocumentDto) {}