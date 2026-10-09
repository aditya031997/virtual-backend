import { PartialType } from '@nestjs/mapped-types';
import { CreateTextDto } from '@/text/dto/createText/index.dto';

export class UpdateTextDto extends PartialType(CreateTextDto) {}