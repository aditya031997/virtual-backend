import { Controller, Get, Query } from '@nestjs/common';
import type { CurrentDayAvailabilityResponse } from '@/types';
import { AvailabilityService } from '@/availability/availabilityService';
import { CurrentDayQueryDto } from '@/availability/dto';

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  /**
   * GET /availability/current-day
   * Returns current time, current mode (businessHours if now is within business hours, otherwise afterHours), and business hours.
   * By default this is for TODAY. Pass an optional `date` query param (YYYY-MM-DD)
   * to get another day's hours — used when a caller asks about tomorrow / next
   * Monday / a specific date. The date must be today or within the look-ahead cap.
   * Time and date are computed in the business timezone (BUSINESS_TIMEZONE env; defaults to Australia/Melbourne).
   * Public endpoint – no authorization required.
   */
  @Get('current-day')
  async getCurrentDayAvailability(
    @Query() query: CurrentDayQueryDto,
  ): Promise<CurrentDayAvailabilityResponse> {
    return this.availabilityService.getCurrentDayAvailability(query);
  }
}
