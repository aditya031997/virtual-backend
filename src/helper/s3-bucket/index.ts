import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    type ListObjectsV2CommandOutput,
    type GetObjectCommandOutput,
    type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import type { IUploadResult } from '@/types';

@Injectable()
export class S3Service {
    private readonly s3Client: S3Client;
    private readonly bucketName: string;
    private readonly logger = new Logger(S3Service.name);

    constructor(private readonly configService: ConfigService) {
        // Get configuration values with fallback validation
        const bucketName = this.configService.get<string>('BUCKET_NAME');
        const region = this.configService.get<string>('REGION');
        const accessKey = this.configService.get<string>('ACCESS_KEY');
        const secretKey = this.configService.get<string>('SECRET_ACCESS_KEY');

        // Validate required configuration
        if (!bucketName || !region || !accessKey || !secretKey) {
            throw new Error('Missing required S3 configuration. Please check your .env file.');
        }

        this.bucketName = bucketName;

        this.s3Client = new S3Client({
            region: region,
            credentials: {
                accessKeyId: accessKey,
                secretAccessKey: secretKey,
            },
        });

        this.logger.log(`S3 Service initialized for bucket: ${this.bucketName}`);
    }

    /**
     * Upload file to S3
     */
    async uploadFile(file: Express.Multer.File): Promise<IUploadResult> {
        try {
            const fileExtension = file.originalname.split('.').pop();
            const uniqueFileName = `${uuidv4()}.${fileExtension}`;
            const s3Key = `documents/${uniqueFileName}`;

            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key,
                Body: file.buffer,
                ContentType: file.mimetype,
                Metadata: {
                    originalName: file.originalname,
                },
            });

            await this.s3Client.send(command);

            this.logger.log(`File uploaded successfully: bucket=${this.bucketName} key=${s3Key}`);

            return {
                fileUrl: s3Key,
                fileName: file.originalname, // Store original filename
                fileSize: file.size,
                mimeType: file.mimetype,
            };
        } catch (error) {
            this.logger.error(`Failed to upload file to S3: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to upload file to S3');
        }
    }

    async uploadFileWithCustomName(
        file: Express.Multer.File,
        targetFileName: string,
        folder: string = 'documents/original-sources'
    ): Promise<IUploadResult> {
        try {
            const s3Key = await this.buildUniqueS3Key(targetFileName, folder);

            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key,
                Body: file.buffer,
                ContentType: file.mimetype,
                Metadata: {
                    originalName: file.originalname,
                },
            });

            await this.s3Client.send(command);
            this.logger.log(`File uploaded successfully with custom name: bucket=${this.bucketName} key=${s3Key}`);

            return {
                fileUrl: s3Key,
                fileName: targetFileName,
                fileSize: file.size,
                mimeType: file.mimetype,
            };
        } catch (error) {
            this.logger.error(`Failed to upload custom-named file to S3: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to upload file to S3');
        }
    }

    async uploadTextContent(
        content: string,
        targetFileName: string,
        contentType: string = 'text/plain; charset=utf-8',
        folder: string = 'documents/original-sources'
    ): Promise<IUploadResult> {
        try {
            const buffer = Buffer.from(content, 'utf-8');
            const s3Key = await this.buildUniqueS3Key(targetFileName, folder);

            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key,
                Body: buffer,
                ContentType: contentType,
            });

            await this.s3Client.send(command);
            this.logger.log(`Text content uploaded successfully: bucket=${this.bucketName} key=${s3Key}`);

            return {
                fileUrl: s3Key,
                fileName: targetFileName,
                fileSize: buffer.length,
                mimeType: contentType,
            };
        } catch (error) {
            this.logger.error(`Failed to upload text content to S3: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to upload content to S3');
        }
    }

    /**
     * Delete file from S3
     */
    async deleteFile(s3Key: string): Promise<void> {
        try {
            const command = new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key,
            });

            await this.s3Client.send(command);
            this.logger.log(`File deleted successfully: bucket=${this.bucketName} key=${s3Key}`);
        } catch (error) {
            this.logger.error(`Failed to delete file from S3: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to delete file from S3');
        }
    }

    /**
     * Generate presigned URL for downloading (expires in 1 hour)
     */
    async getPresignedUrl(s3Key: string): Promise<string> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key,
            });

            // Generate presigned URL that expires in 1 hour (3600 seconds)
            const presignedUrl = await getSignedUrl(this.s3Client, command, {
                expiresIn: 3600,
            });

            this.logger.log(`Generated presigned URL for: ${s3Key}`);
            return presignedUrl;
        } catch (error) {
            this.logger.error(`Failed to generate presigned URL: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to generate download URL');
        }
    }

    /**
     * Check if file exists in S3
     */
    async fileExists(s3Key: string): Promise<boolean> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key,
            });

            await this.s3Client.send(command);
            return true;
        } catch (error) {
            return false;
        }
    }

    async findOriginalSourceByFileName(fileName: string, folder: string = 'documents/original-sources'): Promise<string | null> {
        const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
        const trimmedFileName = fileName.trim();
        const extensionIndex = trimmedFileName.lastIndexOf('.');
        const baseName = extensionIndex > 0 ? trimmedFileName.slice(0, extensionIndex) : trimmedFileName;
        const extension = extensionIndex > 0 ? trimmedFileName.slice(extensionIndex).toLowerCase() : '';

        let continuationToken: string | undefined;

        do {
            const command = new ListObjectsV2Command({
                Bucket: this.bucketName,
                Prefix: `${normalizedFolder}/`,
                ContinuationToken: continuationToken,
            });

            const response = await this.s3Client.send(command) as ListObjectsV2CommandOutput;
            const contents = response.Contents || [];

            for (const object of contents) {
                const key = object.Key;
                if (!key) {
                    continue;
                }

                const candidateFileName = key.split('/').pop() || '';
                const candidateExtensionIndex = candidateFileName.lastIndexOf('.');
                const candidateBaseName = candidateExtensionIndex > 0 ? candidateFileName.slice(0, candidateExtensionIndex) : candidateFileName;
                const candidateExtension = candidateExtensionIndex > 0 ? candidateFileName.slice(candidateExtensionIndex).toLowerCase() : '';

                const exactMatch = candidateFileName === trimmedFileName;
                const prefixedMatch =
                    candidateBaseName === baseName ||
                    candidateBaseName.startsWith(`${baseName}-`);
                const extensionMatches = !extension || candidateExtension === extension;

                if (exactMatch || (prefixedMatch && extensionMatches)) {
                    return key;
                }
            }

            continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
        } while (continuationToken);

        return null;
    }

    async getObjectContent(s3Key: string): Promise<{ body: Buffer; contentType?: string }> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key,
            });

            const response = await this.s3Client.send(command) as GetObjectCommandOutput;
            const body = response.Body;

            if (!body) {
                throw new Error(`S3 object ${s3Key} has no body`);
            }

            const chunks = await body.transformToByteArray();

            return {
                body: Buffer.from(chunks),
                contentType: response.ContentType,
            };
        } catch (error) {
            this.logger.error(`Failed to fetch file from S3: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to fetch file from S3');
        }
    }

    async getObjectMetadata(s3Key: string): Promise<{ contentType?: string; contentLength?: number }> {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key,
            });

            const response = await this.s3Client.send(command) as HeadObjectCommandOutput;

            return {
                contentType: response.ContentType,
                contentLength: response.ContentLength,
            };
        } catch (error) {
            this.logger.error(`Failed to fetch file metadata from S3: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to fetch file metadata from S3');
        }
    }

    private async buildUniqueS3Key(targetFileName: string, folder: string): Promise<string> {
        const sanitizedFolder = folder.replace(/^\/+|\/+$/g, '');
        const sanitizedName = this.sanitizeFileName(targetFileName);
        const extensionIndex = sanitizedName.lastIndexOf('.');
        const baseName = extensionIndex > 0 ? sanitizedName.slice(0, extensionIndex) : sanitizedName;
        const extension = extensionIndex > 0 ? sanitizedName.slice(extensionIndex) : '';

        let suffix = 0;
        while (true) {
            const candidateName = suffix === 0
                ? `${baseName}${extension}`
                : `${baseName}-${suffix}${extension}`;
            const candidateKey = `${sanitizedFolder}/${candidateName}`;
            const exists = await this.fileExists(candidateKey);
            if (!exists) {
                return candidateKey;
            }
            suffix++;
        }
    }

    private sanitizeFileName(value: string): string {
        return value
            .replace(/[\/\\]/g, '-')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Upload audio buffer to S3
     * @param buffer - Audio file buffer
     * @param fileName - Name for the file (without extension)
     * @param contentType - MIME type (e.g., 'audio/mpeg')
     * @param folder - S3 folder path (default: 'audio')
     * @returns S3 key and presigned URL
     */
    async uploadAudioBuffer(
        buffer: Buffer,
        fileName: string,
        contentType: string = 'audio/mpeg',
        folder: string = 'audio'
    ): Promise<{ s3Key: string; url: string }> {
        try {
            // Determine file extension from content type
            let fileExtension = 'mp3'; // default
            if (contentType.includes('mp3') || contentType === 'audio/mpeg') {
                fileExtension = 'mp3';
            } else if (contentType.includes('wav') || contentType === 'audio/wav') {
                fileExtension = 'wav';
            }
            const uniqueFileName = `${fileName}.${fileExtension}`;
            const s3Key = `${folder}/${uniqueFileName}`;

            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key,
                Body: buffer,
                ContentType: contentType,
                Metadata: {
                    fileName: fileName,
                },
            });

            await this.s3Client.send(command);
            this.logger.log(`Audio uploaded successfully: ${s3Key}`);

            // Generate presigned URL that expires in 1 week (maximum allowed by AWS)
            // Note: We'll regenerate this URL on-demand to avoid expiration issues
            const urlCommand = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key,
            });

            const presignedUrl = await getSignedUrl(this.s3Client, urlCommand, {
                expiresIn: 604800, // 1 week in seconds (maximum allowed by AWS)
            });

            return {
                s3Key,
                url: presignedUrl,
            };
        } catch (error) {
            this.logger.error(`Failed to upload audio to S3: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to upload audio to S3');
        }
    }
}