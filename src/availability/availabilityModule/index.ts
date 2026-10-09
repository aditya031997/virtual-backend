import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessHours } from '@/schema';
import { AfterHours } from '@/schema';
import { PublicHolidays } from '@/schema';
import { BusinessHoursService } from '@/availability/businessHoursService';
import { AfterHoursService } from '@/availability/afterHoursService';
import { PublicHolidaysService } from '@/availability/publicHolidayService';
import { AvailabilityService } from '@/availability/availabilityService';
import { BusinessHoursController } from '@/availability/businessHoursController';
import { AfterHoursController } from '@/availability/afterHourController';
import { PublicHolidaysController } from '@/availability/publicHolidayController';
import { AvailabilityController } from '@/availability/availabilityController';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BusinessHours,
      AfterHours,
      PublicHolidays,
    ]),
  ],
  controllers: [
    BusinessHoursController,
    AfterHoursController,
    PublicHolidaysController,
    AvailabilityController,
  ],
  providers: [
    BusinessHoursService,
    AfterHoursService,
    PublicHolidaysService,
    AvailabilityService,
  ],
  exports: [
    BusinessHoursService,
    AfterHoursService,
    PublicHolidaysService,
    AvailabilityService,
  ],
})
export class AvailabilityModule {}