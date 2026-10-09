import { PartialType } from '@nestjs/mapped-types';
import { CreateFaqDto } from '@/FAQ/dto';

export class UpdateFaqDto extends PartialType(CreateFaqDto) {}