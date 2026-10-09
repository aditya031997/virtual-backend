// Response DTOs for HubSpot API

export class HubspotContactsResponseDto {
  success: boolean;
  data: any[];
  count: number;
  message?: string;
}

export class HubspotContactResponseDto {
  success: boolean;
  data: any;
  message?: string;
}

export class HubspotErrorResponseDto {
  success: boolean;
  message: string;
  error?: string;
}

