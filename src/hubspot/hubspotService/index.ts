import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { CreateContactDto, UpdateContactDto } from '@/hubspot/dto';

@Injectable()
export class HubspotService {
  private readonly logger = new Logger(HubspotService.name);
  private readonly accessToken?: string;
  private readonly baseUrl = 'https://api.hubapi.com';
  private readonly axiosInstance: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    // Get access token from environment variable (optional - for backward compatibility)
    // Now we use user-specific tokens from database via HubspotIntegrationService
    this.accessToken = this.configService.get<string>('HUBSPOT_ACCESS_TOKEN') || '';
    
    // Create axios instance with default config (headers will be set per request)
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (this.accessToken) {
      this.logger.log('HubSpot service initialized with global access token');
    } else {
      this.logger.log('HubSpot service initialized (using user-specific tokens from database)');
    }
  }

  /**
   * Get all contacts with optional limit
   * @param limit - Number of contacts to fetch
   * @param accessToken - Optional access token (if not provided, uses global token)
   */
  async getContacts(limit: number = 10, accessToken?: string) {
    try {
      const token = accessToken || this.accessToken;
      if (!token) {
        throw new Error('Access token is required. Please provide a token or configure HUBSPOT_ACCESS_TOKEN.');
      }
      
      const response = await this.axiosInstance.get('/crm/v3/objects/contacts', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: { limit }
      });
      
      this.logger.log(`Successfully fetched ${response.data.results?.length || 0} contacts`);
      return response.data;
    } catch (error: any) {
      this.handleError('fetching contacts', error);
    }
  }

  /**
   * Get a single contact by ID
   * @param contactId - Contact ID
   * @param accessToken - Optional access token (if not provided, uses global token)
   */
  async getContactById(contactId: string, accessToken?: string) {
    try {
      const token = accessToken || this.accessToken;
      if (!token) {
        throw new Error('Access token is required. Please provide a token or configure HUBSPOT_ACCESS_TOKEN.');
      }
      
      const response = await this.axiosInstance.get(
        `/crm/v3/objects/contacts/${contactId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      this.logger.log(`Successfully fetched contact: ${contactId}`);
      return response.data;
    } catch (error: any) {
      this.handleError(`fetching contact ${contactId}`, error);
    }
  }

  /**
   * Create a new contact
   * @param createContactDto - Contact data
   * @param accessToken - Optional access token (if not provided, uses global token)
   */
  async createContact(createContactDto: CreateContactDto, accessToken?: string) {
    try {
      const token = accessToken || this.accessToken;
      if (!token) {
        throw new Error('Access token is required. Please provide a token or configure HUBSPOT_ACCESS_TOKEN.');
      }
      
      const response = await this.axiosInstance.post(
        '/crm/v3/objects/contacts',
        {
          properties: createContactDto
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      this.logger.log(`Successfully created contact: ${response.data.id}`);
      return response.data;
    } catch (error: any) {
      this.handleError('creating contact', error);
    }
  }

  /**
   * Update an existing contact
   * @param contactId - Contact ID
   * @param updateContactDto - Updated contact data
   * @param accessToken - Optional access token (if not provided, uses global token)
   */
  async updateContact(contactId: string, updateContactDto: UpdateContactDto, accessToken?: string) {
    try {
      const token = accessToken || this.accessToken;
      if (!token) {
        throw new Error('Access token is required. Please provide a token or configure HUBSPOT_ACCESS_TOKEN.');
      }
      
      const response = await this.axiosInstance.patch(
        `/crm/v3/objects/contacts/${contactId}`,
        {
          properties: updateContactDto
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      this.logger.log(`Successfully updated contact: ${contactId}`);
      return response.data;
    } catch (error: any) {
      this.handleError(`updating contact ${contactId}`, error);
    }
  }

  /**
   * Delete a contact
   * @param contactId - Contact ID
   * @param accessToken - Optional access token (if not provided, uses global token)
   */
  async deleteContact(contactId: string, accessToken?: string) {
    try {
      const token = accessToken || this.accessToken;
      if (!token) {
        throw new Error('Access token is required. Please provide a token or configure HUBSPOT_ACCESS_TOKEN.');
      }
      
      await this.axiosInstance.delete(`/crm/v3/objects/contacts/${contactId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      this.logger.log(`Successfully deleted contact: ${contactId}`);
      return { deleted: true, id: contactId };
    } catch (error: any) {
      this.handleError(`deleting contact ${contactId}`, error);
    }
  }

  /**
   * Search contacts by email
   * @param email - Email to search for
   * @param accessToken - Optional access token (if not provided, uses global token)
   */
  async searchContactByEmail(email: string, accessToken?: string) {
    try {
      const token = accessToken || this.accessToken;
      if (!token) {
        throw new Error('Access token is required. Please provide a token or configure HUBSPOT_ACCESS_TOKEN.');
      }
      
      const response = await this.axiosInstance.post(
        '/crm/v3/objects/contacts/search',
        {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'email',
                  operator: 'EQ',
                  value: email
                }
              ]
            }
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      this.logger.log(`Search completed for email: ${email}`);
      return response.data;
    } catch (error: any) {
      this.handleError(`searching contact by email ${email}`, error);
    }
  }

  /**
   * Centralized error handling
   */
  private handleError(action: string, error: any): never {
      if (error.response) {
        this.logger.error(
        `HubSpot API Error while ${action}: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        );
      } else {
      this.logger.error(`Error while ${action}: ${error.message}`);
      }
      throw error;
  }
}
