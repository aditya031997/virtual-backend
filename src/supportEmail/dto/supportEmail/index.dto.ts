import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSupportEmailDto {
  @ApiProperty({ description: 'Email UID from IMAP' })
  @IsNumber()
  uid: number;

  @ApiPropertyOptional({ description: 'Message ID' })
  @IsOptional()
  @IsString()
  messageId?: string | null;

  @ApiProperty({ description: 'Sender email address' })
  @IsString()
  fromEmail: string;

  @ApiPropertyOptional({ description: 'Sender name' })
  @IsOptional()
  @IsString()
  fromName?: string | null;

  @ApiPropertyOptional({ description: 'Recipient email addresses' })
  @IsOptional()
  @IsArray()
  toEmails?: string[];

  @ApiPropertyOptional({ description: 'Email subject' })
  @IsOptional()
  @IsString()
  subject?: string | null;

  @ApiProperty({ description: 'Email date' })
  @IsDateString()
  emailDate: string;

  @ApiPropertyOptional({ description: 'Plain text body' })
  @IsOptional()
  @IsString()
  bodyText?: string | null;

  @ApiPropertyOptional({ description: 'HTML body' })
  @IsOptional()
  @IsString()
  bodyHtml?: string | null;

  @ApiPropertyOptional({ description: 'Is email read' })
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;
}

export class UpdateSupportEmailDto {
  @ApiPropertyOptional({ description: 'Is email read' })
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;
}

