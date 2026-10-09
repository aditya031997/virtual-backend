import { Injectable, Logger, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { HubspotIntegration } from '@/schema/hubspotIntegration';
import { TokenEncryptionService } from '@/helper/token-encryption';

@Injectable()
export class HubspotIntegrationService {
  private readonly logger = new Logger(HubspotIntegrationService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly tokenEncryption: TokenEncryptionService;

  constructor(
    @InjectRepository(HubspotIntegration)
    private readonly hubspotIntegrationRepository: Repository<HubspotIntegration>,
    private readonly configService: ConfigService,
  ) {
    this.axiosInstance = axios.create({
      baseURL: 'https://api.hubapi.com',
      timeout: 10000,
    });
    this.tokenEncryption = new TokenEncryptionService();
  }

  /**
   * Validate HubSpot access token by calling HubSpot API
   */
  private async validateHubSpotToken(accessToken: string): Promise<{
    portalId: string;
    accountName?: string;
    timeZone?: string;
  }> {
    try {
      const response = await this.axiosInstance.get('/account-info/v3/details', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.data && response.data.portalId) {
        return {
          portalId: String(response.data.portalId),
          accountName: response.data.companyName || response.data.portalName || undefined,
          timeZone: response.data.timeZone || undefined,
        };
      }

      throw new BadRequestException('Invalid response from HubSpot API');
    } catch (error: any) {
      if (error.response) {
        if (error.response.status === 401) {
          throw new BadRequestException('Invalid access token. Please check your token and try again.');
        }
        if (error.response.status === 403) {
          throw new BadRequestException('Access denied. Please check your token permissions.');
        }
        this.logger.error(`HubSpot API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        throw new BadRequestException(`HubSpot API error: ${error.response.status}`);
      }
      this.logger.error(`Error validating HubSpot token: ${error.message}`);
      throw new BadRequestException('Failed to validate token with HubSpot. Please try again.');
    }
  }

  /**
   * Connect HubSpot account for a user
   */
  async connect(userId: string, accessToken: string): Promise<{
    id: string;
    portalId: string;
    accountName?: string;
    isActive: boolean;
    connectedAt: Date;
  }> {
    try {
      // Validate token format
      if (!accessToken || !accessToken.startsWith('pat-')) {
        throw new BadRequestException('Invalid token format. HubSpot access tokens should start with "pat-"');
      }

      // Validate token with HubSpot API
      const hubspotInfo = await this.validateHubSpotToken(accessToken);

      // Check if user already has an integration
      const existingIntegration = await this.hubspotIntegrationRepository.findOne({
        where: { userId },
      });

      // Encrypt the token before storing
      const encryptedToken = this.tokenEncryption.encrypt(accessToken);

      if (existingIntegration) {
        // Update existing integration
        existingIntegration.accessToken = encryptedToken;
        existingIntegration.portalId = hubspotInfo.portalId;
        existingIntegration.accountName = hubspotInfo.accountName || null;
        existingIntegration.isActive = true;
        existingIntegration.connectedAt = new Date();

        const updated = await this.hubspotIntegrationRepository.save(existingIntegration);
        
        this.logger.log(`Updated HubSpot integration for user ${userId}`);
        
      return {
        id: updated.id,
        portalId: updated.portalId,
        accountName: updated.accountName || undefined,
        isActive: updated.isActive,
        connectedAt: updated.connectedAt,
      };
      } else {
        // Create new integration
        const newIntegration = this.hubspotIntegrationRepository.create({
          userId,
          accessToken: encryptedToken,
          portalId: hubspotInfo.portalId,
          accountName: hubspotInfo.accountName || null,
          isActive: true,
        });

        const saved = await this.hubspotIntegrationRepository.save(newIntegration);
        
        this.logger.log(`Created HubSpot integration for user ${userId}`);
        
        return {
          id: saved.id,
          portalId: saved.portalId,
          accountName: saved.accountName || undefined,
          isActive: saved.isActive,
          connectedAt: saved.connectedAt,
        };
      }
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      this.logger.error(`Error connecting HubSpot: ${error.message}`);
      throw new BadRequestException(`Failed to connect HubSpot: ${error.message}`);
    }
  }

  /**
   * Get HubSpot integration status for a user
   */
  async getStatus(userId: string): Promise<{
    isConnected: boolean;
    portalId?: string;
    accountName?: string;
    connectedAt?: Date;
  } | null> {
    try {
      const integration = await this.hubspotIntegrationRepository.findOne({
        where: { userId, isActive: true },
      });

      if (!integration) {
        return {
          isConnected: false,
        };
      }

      return {
        isConnected: true,
        portalId: integration.portalId,
        accountName: integration.accountName || undefined,
        connectedAt: integration.connectedAt,
      };
    } catch (error: any) {
      this.logger.error(`Error getting HubSpot status: ${error.message}`);
      throw new BadRequestException('Failed to get HubSpot connection status');
    }
  }

  /**
   * Disconnect HubSpot account for a user
   */
  async disconnect(userId: string): Promise<void> {
    try {
      const integration = await this.hubspotIntegrationRepository.findOne({
        where: { userId },
      });

      if (!integration) {
        throw new NotFoundException('HubSpot integration not found');
      }

      // Set isActive to false instead of deleting
      integration.isActive = false;
      await this.hubspotIntegrationRepository.save(integration);

      this.logger.log(`Disconnected HubSpot integration for user ${userId}`);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error disconnecting HubSpot: ${error.message}`);
      throw new BadRequestException('Failed to disconnect HubSpot');
    }
  }

  /**
   * Get decrypted access token for a user (for use in HubSpot API calls)
   */
  async getDecryptedToken(userId: string): Promise<string | null> {
    try {
      const integration = await this.hubspotIntegrationRepository.findOne({
        where: { userId, isActive: true },
      });

      if (!integration) {
        return null;
      }

      return this.tokenEncryption.decrypt(integration.accessToken);
    } catch (error: any) {
      this.logger.error(`Error getting decrypted token: ${error.message}`);
      return null;
    }
  }
}

