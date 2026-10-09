import { PartialType } from '@nestjs/swagger';
import { CreateSupportTypeDto } from '@/supportType/dto/createSupport.dto';

export class UpdateSupportTypeDto extends PartialType(CreateSupportTypeDto) {}

