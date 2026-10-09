import { IsString, IsNotEmpty, IsEmail, IsEnum, IsOptional, IsBoolean, IsUUID, MaxLength, Matches } from 'class-validator';

export class CreateHumanAgentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  agentName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Phone number must be a valid international format' })
  phone: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsEnum(['P1', 'P2', 'P3'], { message: 'Priority must be P1, P2, or P3' })
  @IsNotEmpty()
  priority: 'P1' | 'P2' | 'P3';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

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

  @IsUUID()
  @IsNotEmpty()
  dealerId: string;

  @IsOptional()
  @IsUUID()
  supportTypeId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}