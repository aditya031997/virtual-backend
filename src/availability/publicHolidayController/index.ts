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
import { PublicHolidaysService } from '@/availability/publicHolidayService';
import {
    CreatePublicHolidayDto,
    UpdatePublicHolidayDto,
    PublicHolidayResponseDto
} from '@/availability';

import {
    CreatePublicHolidaysResponse,
    UpdatePublicHolidaysResponse,
    DeletePublicHolidaysResponse
} from '@/types';

@Controller('public-holidays')
export class PublicHolidaysController {
    constructor(private readonly publicHolidaysService: PublicHolidaysService) { }

    @Post('create')
    async create(@Body() createDto: CreatePublicHolidayDto): Promise<CreatePublicHolidaysResponse> {
        return this.publicHolidaysService.create(createDto);
    }

    @Get('get-all')
    async findAll(): Promise<PublicHolidayResponseDto[]> {
        return this.publicHolidaysService.findAll();
    }

    @Patch('update/:id')
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateDto: UpdatePublicHolidayDto,
    ): Promise<UpdatePublicHolidaysResponse> {
        return this.publicHolidaysService.update(id, updateDto);
    }

    @Delete('delete/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(@Param('id', ParseUUIDPipe) id: string): Promise<DeletePublicHolidaysResponse> {
        return this.publicHolidaysService.remove(id);
    }
}