import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    UseGuards,
    ParseUUIDPipe,
    HttpCode,
    HttpStatus,
    Request,
} from '@nestjs/common';
import { HumanAgentService } from '@/humanAgent/humanAgentService';
import {
    CreateHumanAgentDto,
    UpdateHumanAgentDto,
    SearchHumanAgentDto,
    HumanAgentResponseDto
} from '@/humanAgent/dto';
import { AuthGuard } from '@/common/guards/auth.guard';
import type {
    IUpdateAvailabilityRequest,
    IMessageResponse,
    IAuthenticatedRequest
} from '@/types';

@Controller('humanAgents')
@UseGuards(AuthGuard)
export class HumanAgentController {
    constructor(private readonly humanAgentService: HumanAgentService) { }

    /**
     * Create a new human agent
     * @route POST /humanAgents/addAgent
     */
    @Post('addAgent')
    @HttpCode(HttpStatus.CREATED)
    async create(
        @Body() createHumanAgentDto: CreateHumanAgentDto,
        @Request() req: IAuthenticatedRequest
    ): Promise<HumanAgentResponseDto> {
        const userId = req.user.sub;
        return this.humanAgentService.create(createHumanAgentDto, userId);
    }

    /**
     * Get all active human agents
     * @route GET /humanAgents/allAgent
     */
    @Get('allAgent')
    @HttpCode(HttpStatus.OK)
    async getAll(): Promise<HumanAgentResponseDto[]> {
        return this.humanAgentService.findAll();
    }

    /**
     * Search human agents by query (name, email, or phone)
     * @route GET /humanAgents/search
     */
    @Get('search')
    @HttpCode(HttpStatus.OK)
    async search(
        @Query() searchDto: SearchHumanAgentDto
    ): Promise<HumanAgentResponseDto[]> {
        return this.humanAgentService.search(searchDto);
    }

    /**
     * Get a single human agent by ID
     * @route GET /humanAgents/:id
     */
    @Get(':id')
    @HttpCode(HttpStatus.OK)
    async getById(
        @Param('id', ParseUUIDPipe) id: string
    ): Promise<HumanAgentResponseDto> {
        return this.humanAgentService.findOne(id);
    }

    /**
     * Update human agent details
     * @route PATCH /humanAgents/updateAgent/:id
     */
    @Patch('updateAgent/:id')
    @HttpCode(HttpStatus.OK)
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateHumanAgentDto: UpdateHumanAgentDto,
    ): Promise<HumanAgentResponseDto> {
        return this.humanAgentService.update(id, updateHumanAgentDto);
    }

    /**
     * Update agent availability status only
     * @route PATCH /humanAgents/availability/:id
     */
    @Patch('availability/:id')
    @HttpCode(HttpStatus.OK)
    async updateAvailability(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() body: IUpdateAvailabilityRequest
    ): Promise<IMessageResponse> {
        return this.humanAgentService.updateAvailability(id, body.isAvailable);
    }

    /**
     * Delete human agent
     * @route DELETE /humanAgents/deleteAgent/:id
     */
    @Delete('deleteAgent/:id')
    @HttpCode(HttpStatus.OK)
    async delete(
        @Param('id', ParseUUIDPipe) id: string
    ): Promise<IMessageResponse> {
        return this.humanAgentService.remove(id);
    }
}