import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  HttpStatus,
  HttpCode,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ChatbotLeadsService } from '@/chatbotLeads/chatbotLeadsService';
import {
  AppendChatbotMessageDto,
  CreateChatbotAppointmentDto,
  CreateChatbotLeadDto,
  CreateChatbotReturnRequestDto,
  EndSessionDto,
  SessionActivityDto,
  SetSessionConversationDto,
  SubmitSessionFeedbackDto,
  UpdateChatbotLeadDto,
} from '@/chatbotLeads';
import { AuthGuard } from '@/common/guards/auth.guard';
import type {
  IChatbotAppointment,
  IChatbotLead,
  IChatbotLeadProfileChange,
  IChatbotLeadStartResult,
  IChatbotMessage,
  IChatbotReturnRequest,
  IChatbotSession,
} from '@/types';

@Controller('chatbot-leads')
export class ChatbotLeadsController {
  constructor(private readonly chatbotLeadsService: ChatbotLeadsService) {}

  // Create-or-resume lead - Public (called from chatbot widget, no auth).
  // Dedups by email/phone; always returns the active session id + prior
  // history so the widget can continue the conversation.
  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createDto: CreateChatbotLeadDto,
  ): Promise<IChatbotLeadStartResult> {
    return await this.chatbotLeadsService.create(createDto);
  }

  // Append a chat message to a session - Public (widget posts each message)
  @Post('session/message')
  @HttpCode(HttpStatus.CREATED)
  async appendMessage(
    @Body() messageDto: AppendChatbotMessageDto,
  ): Promise<IChatbotMessage> {
    return await this.chatbotLeadsService.appendMessage(messageDto);
  }

  // Bind the ElevenLabs conversation id to a session - Public.
  // Call this once the ElevenLabs client SDK conversation starts so the
  // post-call webhook transcript can be correlated with this lead/session.
  @Patch('session/conversation')
  async setSessionConversation(
    @Body() dto: SetSessionConversationDto,
  ): Promise<IChatbotSession> {
    return await this.chatbotLeadsService.setSessionConversationId(dto);
  }

  // End a session - Public. Idempotent, best-effort.
  // Exposed as BOTH PATCH and POST: navigator.sendBeacon (used for the
  // tab-close signal) can only issue POST; the manual "End Session" button
  // uses PATCH. Both map to the same idempotent handler.
  @Patch('session/end')
  async endSession(@Body() dto: EndSessionDto): Promise<IChatbotSession> {
    return await this.chatbotLeadsService.endSession(dto);
  }

  @Post('session/end')
  @HttpCode(HttpStatus.OK)
  async endSessionBeacon(@Body() dto: EndSessionDto): Promise<IChatbotSession> {
    return await this.chatbotLeadsService.endSession(dto);
  }

  // Activity heartbeat - Public, idempotent. Frontend pings this (or it is
  // implicitly bumped by /session/message) so the server-side TTL job knows
  // the session is still alive.
  @Patch('session/activity')
  async sessionActivity(
    @Body() dto: SessionActivityDto,
  ): Promise<IChatbotSession> {
    return await this.chatbotLeadsService.touchSessionActivity(dto.sessionId);
  }

  // Submit end-of-session feedback (1-10 rating) - Public, idempotent.
  // Persists the rating + derived sentiment ('Negative' | 'Neutral' |
  // 'Positive'). If the session is still active, also closes it with
  // endReason='feedback_given'. Mirrors the session/end pattern.
  @Post('session/feedback')
  @HttpCode(HttpStatus.OK)
  async submitSessionFeedback(
    @Body() dto: SubmitSessionFeedbackDto,
  ): Promise<IChatbotSession> {
    return await this.chatbotLeadsService.submitSessionFeedback(dto);
  }

  // Submit an appointment request - Public (called after the lead form).
  // Persists the appointment and emails SES_SUPPORT_EMAIL.
  @Post('appointment/create')
  @HttpCode(HttpStatus.CREATED)
  async createAppointment(
    @Body() appointmentDto: CreateChatbotAppointmentDto,
  ): Promise<IChatbotAppointment> {
    return await this.chatbotLeadsService.createAppointment(appointmentDto);
  }

  // Submit a return / RMA request - Public (called from the chatbot after the
  // bot has collected product, order ID, reason, and return address from the
  // user). Persists the request and emails SES_SUPPORT_EMAIL.
  @Post('return-request/create')
  @HttpCode(HttpStatus.CREATED)
  async createReturnRequest(
    @Body() returnRequestDto: CreateChatbotReturnRequestDto,
  ): Promise<IChatbotReturnRequest> {
    return await this.chatbotLeadsService.createReturnRequest(returnRequestDto);
  }

  // Full chat history for a lead - Protected (admin dashboard)
  @Get('history/:leadId')
  @UseGuards(AuthGuard)
  async getHistory(
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ): Promise<IChatbotMessage[]> {
    return await this.chatbotLeadsService.getHistory(leadId);
  }

  // Profile change audit (name/email/phone history) - Protected (admin)
  @Get(':leadId/profile-history')
  @UseGuards(AuthGuard)
  async getProfileHistory(
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ): Promise<IChatbotLeadProfileChange[]> {
    return await this.chatbotLeadsService.getProfileChangeHistory(leadId);
  }

  // List all leads - Protected (admin dashboard)
  @Get('all')
  @UseGuards(AuthGuard)
  async findAll(): Promise<IChatbotLead[]> {
    return await this.chatbotLeadsService.findAll();
  }

  // Search leads - Protected
  @Get('search')
  @UseGuards(AuthGuard)
  async search(
    @Query('query') query?: string,
    @Query('name') name?: string,
    @Query('email') email?: string,
    @Query('chatStatus') chatStatus?: string,
    @Query('isActive') isActive?: string,
  ): Promise<IChatbotLead[]> {
    const isActiveBool =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return await this.chatbotLeadsService.search({
      query,
      name,
      email,
      chatStatus,
      isActive: isActiveBool,
    });
  }

  // Get lead by ID - Protected
  @Get('getById/:id')
  @UseGuards(AuthGuard)
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<IChatbotLead> {
    return await this.chatbotLeadsService.findOne(id);
  }

  // Update lead - Protected
  @Patch('update/:id')
  @UseGuards(AuthGuard)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateChatbotLeadDto,
  ): Promise<IChatbotLead> {
    return await this.chatbotLeadsService.update(id, updateDto);
  }

  // Delete lead - Protected
  @Delete('delete/:id')
  @UseGuards(AuthGuard)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    return await this.chatbotLeadsService.remove(id);
  }

  // List all chat sessions (one row per conversation) for the admin
  // Chat History page - Protected.
  // Returns each session with the owning lead's name/email/phone inlined.
  @Get('sessions/all')
  @UseGuards(AuthGuard)
  async findAllSessions() {
    return await this.chatbotLeadsService.findAllSessionsForAdmin();
  }

  // Fetch one chat session + its messages for the Chat History detail
  // page - Protected.
  @Get('sessions/:sessionId')
  @UseGuards(AuthGuard)
  async findOneSession(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return await this.chatbotLeadsService.findSessionByIdForAdmin(sessionId);
  }

  // Delete a single chat session (and its messages) - Protected.
  @Delete('sessions/:sessionId')
  @UseGuards(AuthGuard)
  async removeSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<{ message: string }> {
    return await this.chatbotLeadsService.removeSession(sessionId);
  }
}
