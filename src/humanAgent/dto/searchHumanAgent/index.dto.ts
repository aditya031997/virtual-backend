import { IsOptional, IsString, IsIn } from 'class-validator';

export class SearchHumanAgentDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
