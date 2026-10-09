import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HubspotController } from '@/hubspot/hubspotController';
import { HubspotService } from '@/hubspot/hubspotService';
import { HubspotIntegrationController } from '@/hubspot/hubspotIntegrationController';
import { HubspotIntegrationService } from '@/hubspot/hubspotIntegrationService';
import { HubspotIntegration } from '@/schema/hubspotIntegration';

@Module({
  imports: [TypeOrmModule.forFeature([HubspotIntegration])],
  controllers: [HubspotController, HubspotIntegrationController],
  providers: [HubspotService, HubspotIntegrationService],
  exports: [HubspotService, HubspotIntegrationService],
})
export class HubspotModule {}


