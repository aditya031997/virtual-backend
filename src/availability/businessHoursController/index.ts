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
    Request,
    UseGuards
} from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import type { IAuthenticatedRequest } from '@/types';
import { BusinessHoursService } from '@/availability/businessHoursService';
import {
    CreateBusinessHoursDto,
    UpdateBusinessHoursDto,
    BulkUpdateBusinessHoursDto,
    BusinessHoursResponseDto,
    ToggleBusinessHoursAvailabilityDto
} from '@/availability';
import {
    CreateBusinessHoursResponse,
    UpdateBusinessHoursResponse,
    DeleteBusinessHoursResponse,
    BulkUpdateBusinessHoursResponse,
    ToggleAvailabilityResponse
} from '@/types';

@Controller('business-hours')
@UseGuards(AuthGuard)
export class BusinessHoursController {
    constructor(private readonly businessHoursService: BusinessHoursService) { }

    @Post('create')
    @HttpCode(HttpStatus.CREATED)
    async create(@Body() createDto: CreateBusinessHoursDto): Promise<CreateBusinessHoursResponse> {
        return this.businessHoursService.create(createDto);
    }

    @Post('bulk-update')
    @HttpCode(HttpStatus.OK)
    async bulkUpdate(@Body() bulkUpdateDto: BulkUpdateBusinessHoursDto): Promise<BulkUpdateBusinessHoursResponse> {
        return this.businessHoursService.bulkUpdate(bulkUpdateDto);
    }

    @Get('get-all')
    async findAll(@Request() req: IAuthenticatedRequest): Promise<BusinessHoursResponseDto[]> {
        const userId = req.user?.sub;
        if (!userId) {
            return [];
        }
        return this.businessHoursService.findAll(userId);
    }

    @Get(':id')
    async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<BusinessHoursResponseDto> {
        return this.businessHoursService.findOne(id);
    }

    @Patch('update/:id')
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateDto: UpdateBusinessHoursDto,
    ): Promise<UpdateBusinessHoursResponse> {
        return this.businessHoursService.update(id, updateDto);
    }

    @Patch('toggle-availability/:id')
    @HttpCode(HttpStatus.OK)
    async toggleAvailability(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() toggleDto: ToggleBusinessHoursAvailabilityDto,
    ): Promise<ToggleAvailabilityResponse> {
        return this.businessHoursService.toggleAvailability(id, toggleDto);
    }

    @Delete('delete/:id')
    async remove(@Param('id', ParseUUIDPipe) id: string): Promise<DeleteBusinessHoursResponse> {
        return this.businessHoursService.remove(id);
    }
}