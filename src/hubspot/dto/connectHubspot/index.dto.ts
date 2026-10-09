import { IsString, Matches, MinLength } from 'class-validator';

export class ConnectHubspotDto {
  @IsString({ message: 'Access token must be a string' })
  @MinLength(10, { message: 'Access token is too short' })
  @Matches(/^pat-/, {
    message: 'Invalid token format. HubSpot access tokens should start with "pat-"',
  })
  accessToken: string;
}

