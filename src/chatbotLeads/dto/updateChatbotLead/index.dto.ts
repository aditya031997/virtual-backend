import { PartialType } from '@nestjs/mapped-types';
import { CreateChatbotLeadDto } from '@/chatbotLeads/dto';

export class UpdateChatbotLeadDto extends PartialType(CreateChatbotLeadDto) {}
