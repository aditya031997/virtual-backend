import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateDealerDto } from '@/dealer/dto';

export class UpdateDealerDto extends PartialType(
  OmitType(CreateDealerDto, ['dealerCode', 'userId'] as const)
) {
}