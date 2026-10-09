import { 
  Controller, 
  Get, 
  Post, 
  Patch,
  Delete,
  Body, 
  Param, 
  Query,
  HttpCode, 
  HttpStatus, 
  Logger,
  HttpException,
  ValidationPipe,
  UsePipes
} from '@nestjs/common';
import { HubspotService } from '@/hubspot/hubspotService';
import { 
  CreateContactDto, 
  UpdateContactDto,
  HubspotContactsResponseDto,
  HubspotContactResponseDto,
  HubspotErrorResponseDto
} from '@/hubspot/dto';

@Controller('hubspot')
export class HubspotController {
  private readonly logger = new Logger(HubspotController.name);

  constructor(private readonly hubspotService: HubspotService) {}

  /**
   * GET /hubspot/contacts/allContacts
   * Fetch all contacts with optional limit
   */
  @Get('contacts/allContacts')
  @HttpCode(HttpStatus.OK)
  async getContacts(
    @Query('limit') limit?: number
  ): Promise<HubspotContactsResponseDto> {
    try {
      const contacts = await this.hubspotService.getContacts(limit || 10);
      return {
        success: true,
        data: contacts.results || [],
        count: contacts.results?.length || 0,
        message: 'Contacts fetched successfully',
      };
    } catch (error: any) {
      this.logger.error(`Error in getContacts endpoint: ${error.message}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error.response?.data?.message || 'Failed to fetch contacts from HubSpot',
          error: error.message,
        } as HubspotErrorResponseDto,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /hubspot/contacts/getById/:id
   * Fetch a single contact by ID
   */
  @Get('contacts/getById/:id')
  @HttpCode(HttpStatus.OK)
  async getContactById(
    @Param('id') id: string
  ): Promise<HubspotContactResponseDto> {
    try {
      const contact = await this.hubspotService.getContactById(id);
      return {
        success: true,
        data: contact,
        message: 'Contact fetched successfully',
      };
    } catch (error: any) {
      this.logger.error(`Error in getContactById endpoint: ${error.message}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error.response?.data?.message || 'Failed to fetch contact from HubSpot',
          error: error.message,
        } as HubspotErrorResponseDto,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /hubspot/contacts/create
   * Create a new contact
   */
  @Post('contacts/create')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }))
  async createContact(
    @Body() createContactDto: CreateContactDto
  ): Promise<HubspotContactResponseDto> {
    try {
      const contact = await this.hubspotService.createContact(createContactDto);
      
      return {
        success: true,
        data: contact,
        message: 'Contact created successfully',
      };
    } catch (error: any) {
      this.logger.error(`Error in createContact endpoint: ${error.message}`, error.stack);
      
      // Handle duplicate email error (409 Conflict)
      if (error.response?.status === 409) {
        throw new HttpException(
          {
            success: false,
            message: 'A contact with this email already exists',
            error: error.response?.data?.message,
          } as HubspotErrorResponseDto,
          HttpStatus.CONFLICT,
        );
      }
      
      throw new HttpException(
        {
          success: false,
          message: error.response?.data?.message || 'Failed to create contact in HubSpot',
          error: error.message,
        } as HubspotErrorResponseDto,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PATCH /hubspot/contacts/update/:id
   * Update an existing contact
   */
  @Patch('contacts/update/:id')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }))
  async updateContact(
    @Param('id') id: string,
    @Body() updateContactDto: UpdateContactDto,
  ): Promise<HubspotContactResponseDto> {
    try {
      // Check if there's anything to update
      if (Object.keys(updateContactDto).length === 0) {
        throw new HttpException(
          {
            success: false,
            message: 'No fields provided to update',
          } as HubspotErrorResponseDto,
          HttpStatus.BAD_REQUEST,
        );
      }

      const contact = await this.hubspotService.updateContact(id, updateContactDto);
      
      return {
        success: true,
        data: contact,
        message: 'Contact updated successfully',
      };
    } catch (error: any) {
      this.logger.error(`Error in updateContact endpoint: ${error.message}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error.response?.data?.message || 'Failed to update contact in HubSpot',
          error: error.message,
        } as HubspotErrorResponseDto,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /hubspot/contacts/delete/:id
   * Delete a contact
   */
  @Delete('contacts/delete/:id')
  @HttpCode(HttpStatus.OK)
  async deleteContact(
    @Param('id') id: string
  ): Promise<HubspotContactResponseDto> {
    try {
      const result = await this.hubspotService.deleteContact(id);
      
      return {
        success: true,
        data: result,
        message: 'Contact deleted successfully',
      };
    } catch (error: any) {
      this.logger.error(`Error in deleteContact endpoint: ${error.message}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error.response?.data?.message || 'Failed to delete contact from HubSpot',
          error: error.message,
        } as HubspotErrorResponseDto,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /hubspot/contacts/search/by-email
   * Search contact by email
   */
  @Get('contacts/search/by-email')
  @HttpCode(HttpStatus.OK)
  async searchContactByEmail(
    @Query('email') email: string
  ): Promise<HubspotContactsResponseDto> {
    try {
      if (!email) {
        throw new HttpException(
          {
        success: false,
            message: 'Email query parameter is required',
          } as HubspotErrorResponseDto,
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.hubspotService.searchContactByEmail(email);
      
      return {
        success: true,
        data: result.results || [],
        count: result.results?.length || 0,
        message: 'Search completed successfully',
      };
    } catch (error: any) {
      this.logger.error(`Error in searchContactByEmail endpoint: ${error.message}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error.response?.data?.message || 'Failed to search contact by email',
          error: error.message,
        } as HubspotErrorResponseDto,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

