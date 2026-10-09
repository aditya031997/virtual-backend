import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AppointmentResolverService } from '@/chatbotAppointment/appointmentResolverService';
import { ResolveAppointmentDto } from '@/chatbotAppointment/dto/resolveAppointment/index.dto';
import type { IAppointmentResolution } from '@/types/chatbotAppointment';

/**
 * Grounds a natural-language appointment request.
 *
 * Resolution only — booking still goes through the existing
 * `POST /chatbot-leads/appointment/create`, which owns persistence and the
 * support-inbox notification. Separating the two means the user confirms the
 * date and time before anything is booked.
 */
@Controller('chatbot-appointment')
export class ChatbotAppointmentController {
  constructor(
    private readonly appointmentResolverService: AppointmentResolverService,
  ) {}

  /**
   * Resolve extracted slots into a bookable appointment.
   *
   * Returns 200 in both outcomes — an incomplete request is a normal
   * conversational state, not an error.
   */
  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Body() resolveDto: ResolveAppointmentDto,
  ): Promise<IAppointmentResolution> {
    return await this.appointmentResolverService.resolve({
      slots: resolveDto.slots,
      timezone: resolveDto.timezone ?? 'UTC',
      ...(resolveDto.registeredContact
        ? { registeredContact: resolveDto.registeredContact }
        : {}),
      overrides: resolveDto.overrides,
    });
  }
}
