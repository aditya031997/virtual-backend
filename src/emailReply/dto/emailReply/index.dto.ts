import { IsString, IsNotEmpty, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEmailReplyDto {
  @ApiProperty({ description: 'Support email ID (UUID)' })
  @IsUUID()
  @IsNotEmpty()
  supportEmailId: string;

  @ApiProperty({ description: 'From email address' })
  @IsString()
  @IsNotEmpty()
  fromEmail: string;

  @ApiProperty({ description: 'To email address' })
  @IsString()
  @IsNotEmpty()
  toEmail: string;

  @ApiPropertyOptional({ description: 'Reply subject' })
  @IsOptional()
  @IsString()
  subject?: string | null;

  @ApiProperty({ description: 'Reply content' })
  @IsString()
  @IsNotEmpty()
  replyContent: string;

  @ApiPropertyOptional({ 
    description: 'Reply status', 
    enum: ['draft', 'sent'],
    default: 'draft'
  })
  @IsOptional()
  @IsEnum(['draft', 'sent'])
  status?: 'draft' | 'sent';
}

export class UpdateEmailReplyDto {
  @ApiPropertyOptional({ description: 'Reply subject' })
  @IsOptional()
  @IsString()
  subject?: string | null;

  @ApiPropertyOptional({ description: 'Reply content' })
  @IsOptional()
  @IsString()
  replyContent?: string;

  @ApiPropertyOptional({ 
    description: 'Reply status', 
    enum: ['draft', 'sent']
  })
  @IsOptional()
  @IsEnum(['draft', 'sent'])
  status?: 'draft' | 'sent';
}

export class GenerateReplyDto {
  @ApiProperty({ description: 'Customer name' })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiPropertyOptional({ description: 'Customer email' })
  @IsOptional()
  @IsString()
  customerEmail?: string;

  @ApiPropertyOptional({ description: 'Customer phone' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiProperty({ description: 'Email subject' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiPropertyOptional({ description: 'Call transcript' })
  @IsOptional()
  @IsString()
  transcript?: string;

  @ApiPropertyOptional({ description: 'Original email body content' })
  @IsOptional()
  @IsString()
  emailBody?: string;

  @ApiPropertyOptional({ description: 'Dealer code' })
  @IsOptional()
  @IsString()
  dealerCode?: string;
}






