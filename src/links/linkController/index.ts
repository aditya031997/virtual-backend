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
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { LinkService } from '@/links/linkService';
import { CreateLinkDto, UpdateLinkDto, LinkResponseDto } from '@/links/dto';
import { AuthGuard } from '@/common/guards/auth.guard';
import type { IAuthenticatedRequest, IApiResponse } from '@/types';

@Controller('links')
@UseGuards(AuthGuard)
export class LinkController {
    constructor(private readonly linkService: LinkService) { }

    @Post('create')
    async create(
        @Body() createLinkDto: CreateLinkDto,
        @Req() req: IAuthenticatedRequest,
    ): Promise<IApiResponse<LinkResponseDto>> {
        const dataWithUserId = {
            ...createLinkDto,
            userId: req.user.sub
        };
        const link = await this.linkService.create(dataWithUserId);
        return {
            success: true,
            message: 'Link created successfully',
            data: link
        };
    }

    @Get('get')
    async findAll(@Req() req: IAuthenticatedRequest): Promise<IApiResponse<LinkResponseDto[]>> {
        const userId = req.user.sub;
        const links = await this.linkService.findAll(userId);
        return {
            success: true,
            message: `Retrieved ${links.length} link(s) successfully`,
            data: links
        };
    }

    @Get('getById/:id')
    async findById(
        @Param('id') id: string,
        @Req() req: IAuthenticatedRequest,
    ): Promise<IApiResponse<LinkResponseDto>> {
        const userId = req.user.sub;
        const link = await this.linkService.findById(id, userId);
        return {
            success: true,
            message: 'Link retrieved successfully',
            data: link
        };
    }

    @Patch('update/:id')
    async update(
        @Param('id') id: string,
        @Body() updateLinkDto: UpdateLinkDto,
        @Req() req: IAuthenticatedRequest,
    ): Promise<IApiResponse<LinkResponseDto>> {
        const userId = req.user.sub;
        const link = await this.linkService.update(id, updateLinkDto, userId);
        return {
            success: true,
            message: 'Link updated successfully',
            data: link
        };
    }

    @Delete('delete/:id')
    @HttpCode(HttpStatus.OK)
    async delete(
        @Param('id') id: string,
        @Req() req: IAuthenticatedRequest,
    ): Promise<IApiResponse<null>> {
        const userId = req.user.sub;
        await this.linkService.delete(id, userId);
        return {
            success: true,
            message: 'Link deleted successfully',
            data: null
        };
    }
}