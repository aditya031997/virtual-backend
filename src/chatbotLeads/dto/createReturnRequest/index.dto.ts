import {
  IsString,
  IsUUID,
  IsOptional,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { ICreateChatbotReturnRequestData } from '@/types';

export class CreateChatbotReturnRequestDto
  implements ICreateChatbotReturnRequestData
{
  @IsUUID()
  leadId!: string;

  @IsUUID()
  @IsOptional()
  sessionId?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  productName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  orderId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reasonForReturn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  returnAddress!: string;
}
