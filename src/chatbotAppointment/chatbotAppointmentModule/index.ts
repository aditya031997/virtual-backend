import { Module } from '@nestjs/common';
import { AvailabilityModule } from '@/availability';
import { ChatbotAppointmentController } from '@/chatbotAppointment/chatbotAppointmentController';
import { AppointmentDateResolverService } from '@/chatbotAppointment/appointmentDateResolverService';
import { AppointmentResolverService } from '@/chatbotAppointment/appointmentResolverService';

/**
 * Conversational appointment booking.
 *
 * Turns "can I schedule a meeting with the sales team next week?" into a
 * concrete date, time and department, asking follow-up questions for anything
 * missing. `AppointmentResolverService` is exported so the widget flow can use
 * it directly rather than over HTTP.
 */
@Module({
  // Business hours and public holidays decide which days and times can be
  // booked; without them the resolver would fall back to a generic window.
  imports: [AvailabilityModule],
  controllers: [ChatbotAppointmentController],
  providers: [AppointmentResolverService, AppointmentDateResolverService],
  exports: [AppointmentResolverService],
})
export class ChatbotAppointmentModule {}
