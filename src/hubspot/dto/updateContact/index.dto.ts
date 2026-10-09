import { PartialType } from '@nestjs/mapped-types';
import { CreateContactDto } from '@/hubspot/dto/createContact/index.dto';

// Update Contact DTO - uses PartialType to make all fields optional
export class UpdateContactDto extends PartialType(CreateContactDto) {
  // All fields from CreateContactDto are now optional
  // You can add additional fields specific to updates if needed
}

