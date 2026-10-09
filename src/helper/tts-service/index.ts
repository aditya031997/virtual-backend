import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { S3Service } from '@/helper/s3-bucket';
import { KnowledgeBaseHelper } from '@/helper/knowledgeBase';

@Injectable()
export class TTSService {
  private readonly elevenLabsClient: ElevenLabsClient;
  private readonly logger = new Logger(TTSService.name);
  private readonly defaultAgentId: string;
  private readonly knowledgeBaseHelper: KnowledgeBaseHelper;
  private audioCache: Map<string, string> = new Map(); // Cache for S3 keys (not URLs, to avoid expiration)

  constructor(
    private readonly configService: ConfigService,
    private readonly s3Service: S3Service,
  ) {
    const apiKey = this.configService.get<string>('ELEVENLABS_API_KEY');
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    const agentId = this.configService.get<string>('ELEVENLABS_AGENT_ID');
    if (!agentId) {
      throw new Error('ELEVENLABS_AGENT_ID is not configured');
    }

    this.defaultAgentId = agentId;
    const headers = { 'xi-api-key': apiKey };
    this.knowledgeBaseHelper = new KnowledgeBaseHelper(headers);

    this.elevenLabsClient = new ElevenLabsClient({
      environment: 'https://api.elevenlabs.io',
      apiKey,
    });

    this.logger.log('TTSService initialized successfully');
  }

  /**
   * Get voice ID from environment variable or agent configuration
   */
  private async getVoiceId(): Promise<string> {
    // First, try to get voice ID from environment variable
    const envVoiceId = this.configService.get<string>('ELEVENLABS_VOICE_ID');
    if (envVoiceId) {
      this.logger.log(`Using voice ID from environment: ${envVoiceId}`);
      return envVoiceId;
    }

    // Otherwise, try to get from agent configuration
    try {
      const agentConfig = await this.knowledgeBaseHelper.getAgentConfig(this.defaultAgentId);
      const voiceId = agentConfig?.conversation_config?.agent?.voice?.voice_id;
      
      if (voiceId) {
        this.logger.log(`Using voice ID from agent config: ${voiceId}`);
        return voiceId;
      }
    } catch (error) {
      this.logger.warn(`Failed to get voice ID from agent config: ${error.message}`);
    }

    // Fallback: throw error if no voice ID found
    throw new Error(
      'Voice ID not found. Please set ELEVENLABS_VOICE_ID in environment variables or ensure agent has voice configuration.'
    );
  }

  /**
   * Generate audio from text using ElevenLabs TTS and store in S3
   * @param text - Text to convert to speech
   * @param cacheKey - Optional cache key (defaults to text hash)
   * @returns S3 presigned URL for the audio file
   */
  async generateAndStoreAudio(text: string, cacheKey?: string): Promise<string> {
    if (!text || text.trim() === '') {
      throw new Error('Text is required for TTS generation');
    }

    // Use provided cache key or generate one from text
    const key = cacheKey || this.generateCacheKey(text);

    // Check cache first
    if (this.audioCache.has(key)) {
      const cachedS3Key = this.audioCache.get(key);
      if (cachedS3Key) {
        this.logger.log(`Using cached audio S3 key for: ${key.substring(0, 50)}...`);
        
        // Verify the file still exists in S3
        if (await this.s3Service.fileExists(cachedS3Key)) {
          // Generate fresh presigned URL (to avoid expiration issues)
          const presignedUrl = await this.s3Service.getPresignedUrl(cachedS3Key);
          return presignedUrl;
        } else {
          // Cache is stale, remove it
          this.audioCache.delete(key);
        }
      }
    }

    try {
      // Get voice ID
      const voiceId = await this.getVoiceId();

      this.logger.log(`Generating TTS audio for text: ${text.substring(0, 50)}...`);

      // Generate audio using ElevenLabs TTS
      const audioStream = await this.elevenLabsClient.textToSpeech.convert(voiceId, {
        outputFormat: 'mp3_44100_128',
        text: text,
        modelId: 'eleven_multilingual_v2',
      });

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);

      this.logger.log(`Audio generated successfully, size: ${audioBuffer.length} bytes`);

      // Upload to S3
      const fileName = `tts_${key}`;
      const { s3Key, url } = await this.s3Service.uploadAudioBuffer(
        audioBuffer,
        fileName,
        'audio/mpeg',
        'audio'
      );

      // Cache the S3 key (not URL, to avoid expiration issues)
      this.audioCache.set(key, s3Key);

      this.logger.log(`Audio uploaded to S3 and cached: ${fileName}`);
      return url;
    } catch (error: any) {
      this.logger.error(`Failed to generate TTS audio: ${error.message}`, error.stack);
      throw new Error(`TTS generation failed: ${error.message}`);
    }
  }

  /**
   * Generate a cache key from text (simple hash)
   */
  private generateCacheKey(text: string): string {
    // Simple hash function for cache key
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Extract S3 key from presigned URL
   */
  private extractS3KeyFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      // Remove leading slash and bucket name if present
      const parts = pathname.split('/').filter(p => p);
      // Skip bucket name (first part) and get the rest
      if (parts.length > 1) {
        return parts.slice(1).join('/');
      }
      return parts.join('/');
    } catch {
      return null;
    }
  }

  /**
   * Clear cache (useful for testing or when regenerating audio)
   */
  clearCache(): void {
    this.audioCache.clear();
    this.logger.log('TTS cache cleared');
  }
}

