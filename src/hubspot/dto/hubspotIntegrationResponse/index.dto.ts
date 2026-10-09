export class HubspotIntegrationResponseDto {
  success: boolean;
  message: string;
  data?: {
    id: string;
    portalId: string;
    accountName?: string;
    isActive: boolean;
    connectedAt: Date;
  };
}

