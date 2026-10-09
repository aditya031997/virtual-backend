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
    Query
} from '@nestjs/common';
import { AfterHoursService } from '@/availability/afterHoursService';
import {
    CreateAfterHoursDto,
    UpdateAfterHoursDto,
    BulkUpdateAfterHoursDto,
    AfterHoursResponseDto,
    ToggleAfterHoursAvailabilityDto
} from '@/availability';
import {
    CreateAfterHoursResponse,
    UpdateAfterHoursResponse,
    DeleteAfterHoursResponse,
    BulkUpdateAfterHoursResponse,
    ToggleAfterAvailabilityResponse
} from '@/types';

@Controller('after-hours')
export class AfterHoursController {
    constructor(private readonly afterHoursService: AfterHoursService) { }

    @Post('create')
    @HttpCode(HttpStatus.CREATED)
    async create(@Body() createDto: CreateAfterHoursDto): Promise<CreateAfterHoursResponse> {
        return this.afterHoursService.create(createDto);
    }

    @Post('bulk-update')
    @HttpCode(HttpStatus.OK)
    async bulkUpdate(@Body() bulkUpdateDto: BulkUpdateAfterHoursDto): Promise<BulkUpdateAfterHoursResponse> {
        return this.afterHoursService.bulkUpdate(bulkUpdateDto);
    }

    @Get('get-all')
    async findAll(): Promise<AfterHoursResponseDto[]> {
        return this.afterHoursService.findAll();
    }

    @Get(':id')
    async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AfterHoursResponseDto> {
        return this.afterHoursService.findOne(id);
    }

    @Patch('update/:id')
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateDto: UpdateAfterHoursDto,
    ): Promise<UpdateAfterHoursResponse> {
        return this.afterHoursService.update(id, updateDto);
    }

    @Patch('toggle-availability/:id')
    @HttpCode(HttpStatus.OK)
    async toggleAvailability(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() toggleDto: ToggleAfterHoursAvailabilityDto,
    ): Promise<ToggleAfterAvailabilityResponse> {
        return this.afterHoursService.toggleAvailability(id, toggleDto);
    }

    @Delete('delete/:id')
    async remove(@Param('id', ParseUUIDPipe) id: string): Promise<DeleteAfterHoursResponse> {
        return this.afterHoursService.remove(id);
    }
}