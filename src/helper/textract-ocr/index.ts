import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
} from '@aws-sdk/client-textract';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TextractOcrService {
  private readonly logger = new Logger(TextractOcrService.name);
  private readonly s3Client: S3Client | null;
  private readonly textractClient: TextractClient | null;
  private readonly bucketName: string;
  private readonly tempPrefix = 'textract-tmp/';
  private readonly pollInitialMs = 800;
  private readonly pollMaxMs = 3000;
  private readonly pollTimeoutMs = 3 * 60 * 1000;

  constructor(private readonly configService: ConfigService) {
    const bucketName = this.configService.get<string>('BUCKET_NAME');
    const region = this.configService.get<string>('REGION');
    const accessKey = this.configService.get<string>('ACCESS_KEY');
    const secretKey = this.configService.get<string>('SECRET_ACCESS_KEY');

    if (!bucketName || !region || !accessKey || !secretKey) {
      this.logger.warn('AWS configuration missing. Textract OCR is disabled.');
      this.s3Client = null;
      this.textractClient = null;
      this.bucketName = '';
      return;
    }

    this.bucketName = bucketName;
    const credentials = { accessKeyId: accessKey, secretAccessKey: secretKey };
    this.s3Client = new S3Client({ region, credentials });
    this.textractClient = new TextractClient({ region, credentials });
  }

  isConfigured(): boolean {
    return this.s3Client !== null && this.textractClient !== null;
  }

  async extractTextFromPdf(buffer: Buffer, originalFileName: string): Promise<string> {
    if (!this.s3Client || !this.textractClient) {
      throw new Error('Textract OCR is not configured');
    }

    const s3Key = `${this.tempPrefix}${uuidv4()}.pdf`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: buffer,
        ContentType: 'application/pdf',
      }),
    );

    try {
      const startResponse = await this.textractClient.send(
        new StartDocumentTextDetectionCommand({
          DocumentLocation: {
            S3Object: { Bucket: this.bucketName, Name: s3Key },
          },
        }),
      );

      const jobId = startResponse.JobId;
      if (!jobId) {
        throw new Error('Textract did not return a JobId');
      }

      return await this.pollAndCollectText(jobId, originalFileName);
    } finally {
      try {
        await this.s3Client.send(
          new DeleteObjectCommand({ Bucket: this.bucketName, Key: s3Key }),
        );
      } catch (cleanupError: any) {
        this.logger.warn(
          `Failed to clean up Textract temp object ${s3Key}: ${cleanupError.message}`,
        );
      }
    }
  }

  private async pollAndCollectText(jobId: string, originalFileName: string): Promise<string> {
    const startTime = Date.now();
    let waitMs = this.pollInitialMs;

    while (true) {
      if (Date.now() - startTime > this.pollTimeoutMs) {
        throw new Error(
          `Textract job ${jobId} for ${originalFileName} timed out after ${this.pollTimeoutMs / 1000}s`,
        );
      }

      const initial = await this.textractClient!.send(
        new GetDocumentTextDetectionCommand({ JobId: jobId }),
      );
      const status = initial.JobStatus;

      if (status === 'IN_PROGRESS') {
        await this.sleep(waitMs);
        waitMs = Math.min(Math.round(waitMs * 1.5), this.pollMaxMs);
        continue;
      }

      if (status !== 'SUCCEEDED') {
        throw new Error(
          `Textract job ${jobId} for ${originalFileName} returned status ${status}: ${initial.StatusMessage || 'no message'}`,
        );
      }

      const lines: string[] = [];
      let response = initial;
      let nextToken = response.NextToken;

      this.collectLineBlocks(response.Blocks, lines);

      while (nextToken) {
        response = await this.textractClient!.send(
          new GetDocumentTextDetectionCommand({ JobId: jobId, NextToken: nextToken }),
        );
        this.collectLineBlocks(response.Blocks, lines);
        nextToken = response.NextToken;
      }

      return lines.join('\n').trim();
    }
  }

  private collectLineBlocks(blocks: unknown, into: string[]): void {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks) {
      if (block?.BlockType === 'LINE' && typeof block?.Text === 'string') {
        into.push(block.Text);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
