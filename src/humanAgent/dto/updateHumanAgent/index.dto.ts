import { PartialType } from '@nestjs/mapped-types';
import { CreateHumanAgentDto } from '@/humanAgent/dto';

export class UpdateHumanAgentDto extends PartialType(CreateHumanAgentDto) {}