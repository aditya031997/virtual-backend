import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CareFacility } from '@/schema';
import { CareFacilityService } from './careFacility.service';
import { CareFacilityController } from './careFacility.controller';
import { User } from '@/schema/user/user.entity'; 
import { HumanAgent } from '@/schema';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CareFacility,
      User,
      HumanAgent
    ]),
  ],
  controllers: [CareFacilityController],
  providers: [CareFacilityService],
  exports: [CareFacilityService],
})
export class CareFacilityModule {}