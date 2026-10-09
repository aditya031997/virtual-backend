import {
    Controller,
    Get,
    Post,
    Param,
    Patch,
    Delete,
    Body,
    UseGuards,
    Req,
} from '@nestjs/common';
import { TextService } from '@/text/textService';
import { CreateTextDto, UpdateTextDto, TextResponseDto } from '@/text/dto';
import { AuthGuard } from '@/common/guards/auth.guard';
import type { IAuthenticatedRequest, IApiResponse } from '@/types';

@Controller('texts')
@UseGuards(AuthGuard)
export class TextController {
    constructor(private readonly textService: TextService) {}

    @Post('add')
    async create(
        @Body() createTextDto: CreateTextDto,
        @Req() req: IAuthenticatedRequest,
    ): Promise<IApiResponse<TextResponseDto>> {
        const dataWithUserId = {
            ...createTextDto,
            userId: req.user.sub
        };
        const text = await this.textService.create(dataWithUserId);
        return {
            success: true,
            message: 'Text created successfully',
            data: text
        };
    }

    @Get('allTexts')
    async findAll(@Req() req: IAuthenticatedRequest): Promise<IApiResponse<TextResponseDto[]>> {
        const userId = req.user.sub;
        const texts = await this.textService.findAll(userId);
        return {
            success: true,
            message: `Retrieved ${texts.length} text(s) successfully`,
            data: texts
        };
    }

    @Patch('update/:id')
    async update(
        @Param('id') id: string,
        @Body() updateTextDto: UpdateTextDto,
        @Req() req: IAuthenticatedRequest,
    ): Promise<IApiResponse<TextResponseDto>> {
        const userId = req.user.sub;
        const text = await this.textService.update(id, updateTextDto, userId);
        return {
            success: true,
            message: 'Text updated successfully',
            data: text
        };
    }

    @Delete('delete/:id')
    async delete(
        @Param('id') id: string,
        @Req() req: IAuthenticatedRequest,
    ): Promise<IApiResponse<void>> {
        const userId = req.user.sub;
        await this.textService.delete(id, userId);
        return {
            success: true,
            message: 'Text deleted successfully',
            data: undefined
        };
    }
}