import { PartialType } from '@nestjs/mapped-types';
import { CreateLinkDto } from '@/links/dto';

export class UpdateLinkDto extends PartialType(CreateLinkDto) {}