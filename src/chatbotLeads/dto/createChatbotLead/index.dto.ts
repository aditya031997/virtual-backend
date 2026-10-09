import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ICreateChatbotLeadData } from '@/types';

export class CreateChatbotLeadDto implements ICreateChatbotLeadData {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  contact?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  chatStatus?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;

  // Deliberately NOT @IsUUID: the widget's siteId comes from the smartcaller
  // service, whose ids are cuids. Validating it as a uuid rejected every real
  // value and lost the chat along with it.
  @IsString()
  @IsOptional()
  @MaxLength(255)
  siteId?: string | null;
}
