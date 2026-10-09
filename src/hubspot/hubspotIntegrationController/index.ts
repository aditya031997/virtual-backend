import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HubspotIntegrationService } from '@/hubspot/hubspotIntegrationService';
import { ConnectHubspotDto, HubspotIntegrationResponseDto } from '@/hubspot/dto';
import { AuthGuard } from '@/common/guards/auth.guard';
import type { IAuthenticatedRequest } from '@/types';

@Controller('hubspot')
export class HubspotIntegrationController {
  private readonly logger = new Logger(HubspotIntegrationController.name);

  constructor(
    private readonly hubspotIntegrationService: HubspotIntegrationService,
  ) {}

  /**
   * POST /hubspot/connect
   * Connect HubSpot account with access token
   */
  @Post('connect')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async connect(
    @Body() connectDto: ConnectHubspotDto,
    @Req() req: IAuthenticatedRequest,
  ): Promise<HubspotIntegrationResponseDto> {
    try {
      const userId = req.user.sub;
      
      const result = await this.hubspotIntegrationService.connect(
        userId,
        connectDto.accessToken,
      );

      return {
        success: true,
        message: 'HubSpot account connected successfully',
        data: result,
      };
    } catch (error: any) {
      this.logger.error(`Error in connect endpoint: ${error.message}`, error.stack);
      
      return {
        success: false,
        message: error.message || 'Failed to connect HubSpot account',
      };
    }
  }

  /**
   * GET /hubspot/status
   * Get HubSpot connection status
   */
  @Get('status')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async getStatus(
    @Req() req: IAuthenticatedRequest,
  ): Promise<HubspotIntegrationResponseDto> {
    try {
      const userId = req.user.sub;
      
      const status = await this.hubspotIntegrationService.getStatus(userId);

      if (!status || !status.isConnected) {
        return {
          success: true,
          message: 'HubSpot account not connected',
          data: {
            id: '',
            portalId: '',
            accountName: '',
            isActive: false,
            connectedAt: new Date(),
          },
        };
      }

      return {
        success: true,
        message: 'HubSpot account is connected',
        data: {
          id: '',
          portalId: status.portalId || '',
          accountName: status.accountName || '',
          isActive: true,
          connectedAt: status.connectedAt || new Date(),
        },
      };
    } catch (error: any) {
      this.logger.error(`Error in getStatus endpoint: ${error.message}`, error.stack);
      
      return {
        success: false,
        message: error.message || 'Failed to get HubSpot connection status',
      };
    }
  }

  /**
   * DELETE /hubspot/disconnect
   * Disconnect HubSpot account
   */
  @Delete('disconnect')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async disconnect(
    @Req() req: IAuthenticatedRequest,
  ): Promise<HubspotIntegrationResponseDto> {
    try {
      const userId = req.user.sub;
      
      await this.hubspotIntegrationService.disconnect(userId);

      return {
        success: true,
        message: 'HubSpot account disconnected successfully',
      };
    } catch (error: any) {
      this.logger.error(`Error in disconnect endpoint: ${error.message}`, error.stack);
      
      return {
        success: false,
        message: error.message || 'Failed to disconnect HubSpot account',
      };
    }
  }
}

