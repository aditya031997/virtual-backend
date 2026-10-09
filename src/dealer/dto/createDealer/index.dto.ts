import { IsString, IsEmail, IsUUID, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ICreateDealerData } from '@/types';

export class CreateDealerDto implements ICreateDealerData {
  @IsString()
  @IsOptional()
  @MaxLength(4)
  dealerCode?: string;

  @IsString()
  @MaxLength(100)
  dealerName: string;

  @IsString()
  @MaxLength(20)
  phone: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  businessAddress: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  state?: string;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  stateCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @IsString()
  @IsOptional()
  description: string;

  @IsUUID()
  @IsOptional()
  userId: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}