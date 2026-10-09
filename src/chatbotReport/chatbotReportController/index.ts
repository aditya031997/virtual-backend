import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ReportResolverService } from '@/chatbotReport/reportResolverService';
import { ReportTypeMapperService } from '@/chatbotReport/reportTypeMapperService';
import { ResolveReportDto } from '@/chatbotReport/dto/resolveReport/index.dto';
import { SearchReportTypesDto } from '@/chatbotReport/dto/searchReportTypes/index.dto';
import type { IReportResolution } from '@/types/chatbotReport';

/**
 * Grounds a natural-language report request against real site data.
 *
 * Resolution only — this endpoint never generates a report. It returns either a
 * ready-to-submit payload plus a plain-English summary for the user to confirm,
 * or the questions still needed. Generation stays with the existing
 * `POST /reports/chatbot/generate` on the smartcaller backend, which already
 * owns auth, export and file handling.
 *
 * Keeping the two apart means the user always sees and confirms the
 * interpretation before any report runs.
 */
@Controller('chatbot-report')
export class ChatbotReportController {
  constructor(
    private readonly reportResolverService: ReportResolverService,
    private readonly reportTypeMapperService: ReportTypeMapperService,
  ) {}

  /**
   * Search the report catalogue for the widget's type picker.
   *
   * Paginated so the chat can render a searchable dropdown rather than one
   * button per report — a list that is readable at nine entries and unusable
   * at a hundred.
   */
  @Get('types')
  searchTypes(@Query() query: SearchReportTypesDto): {
    items: { id: string; name: string }[];
    total: number;
    hasMore: boolean;
  } {
    return this.reportTypeMapperService.searchTypes(
      query.search ?? '',
      query.page ?? 1,
      query.limit ?? 50,
    );
  }

  /**
   * Resolve extracted slots into a report payload.
   *
   * Returns 200 in both outcomes — an incomplete request is a normal
   * conversational state, not an error.
   */
  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Body() resolveDto: ResolveReportDto,
  ): Promise<IReportResolution> {
    return await this.reportResolverService.resolve({
      slots: resolveDto.slots,
      siteId: resolveDto.siteId,
      timezone: resolveDto.timezone ?? 'UTC',
      overrides: resolveDto.overrides,
    });
  }
}
