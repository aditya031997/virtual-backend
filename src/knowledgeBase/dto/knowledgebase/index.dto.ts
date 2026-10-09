import { IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadKnowledgeBaseDto {
  @ApiProperty({ description: 'ID of the agent to attach document to' })
  @IsString()
  @IsNotEmpty()
  agentId: string;

  @ApiPropertyOptional({ description: 'URL to upload to knowledge base' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ description: 'Text content to upload to knowledge base' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ description: 'Optional name for the file/text/URL' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class UploadUrlDto {
  @ApiProperty({
    description: 'URL to upload to knowledge base'
  })
  @IsString()
  @IsNotEmpty()
  url: string;
}

export class UpdateDocumentDto {
  @ApiProperty({
    description: 'New name for the document'
  })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UploadTextDto {
  @ApiProperty({
    description: 'Text content to upload to knowledge base'
  })
  @IsString()
  @IsNotEmpty()
  text: string;
}

export class AddSitemapDto {
  @ApiProperty({ description: 'Sitemap URL' })
  @IsString()
  @IsNotEmpty()
  url: string;
}

export class SyncSitemapDto {
  @ApiProperty({ description: 'Sitemap ID' })
  @IsString()
  @IsNotEmpty()
  sitemapId: string;
}

export class ProcessBatchDto {
  @ApiProperty({ description: 'Sitemap ID to process batch for' })
  @IsString()
  @IsNotEmpty()
  sitemapId: string;
}

export class FinalizeSitemapDto {
  @ApiProperty({ description: 'Sitemap ID to finalize' })
  @IsString()
  @IsNotEmpty()
  sitemapId: string;
}

export class SearchKnowledgeBaseEmailDto {
  @ApiProperty({ description: 'Query to search against the internal knowledge base' })
  @IsString()
  @IsNotEmpty()
  query: string;

  @ApiProperty({ description: 'Recipient email address' })
  @IsString()
  @IsNotEmpty()
  email: string;
}