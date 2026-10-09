import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { SiteService } from '@/site/siteService';
import { CreateSiteDto,UpdateSiteDto } from '@/site';
import { AuthGuard } from '@/common/guards/auth.guard';
import type { IAuthenticatedRequest } from '@/types';

@Controller('sites')
export class SiteController {
    constructor(private readonly siteService: SiteService) {}

    @Post('create')
    @UseGuards(AuthGuard)
    async create(
        @Body() createSiteDto: CreateSiteDto,
        @Request() req: IAuthenticatedRequest 
    ) {
        const userId = req.user?.sub
        return await this.siteService.create(createSiteDto, userId);
    }

    @Get('allSites')
    @UseGuards(AuthGuard)
    async findAll(@Request() req: IAuthenticatedRequest) {
        const userId = req.user?.sub
        return await this.siteService.findAll(userId);
    }

    @Get('getById/:id')
    @UseGuards(AuthGuard)
    async findById(
        @Param('id') id: string,
        @Request() req: IAuthenticatedRequest
    ) {
        const userId = req.user?.sub
        return await this.siteService.findById(id, userId);
    }

    /** Public – no authorization required. */
    @Get('getBySiteName')
    async findBySiteName(@Query('siteName') siteName: string) {
        return await this.siteService.findByName(siteName);
    }

    @Put('update/:id')
    @UseGuards(AuthGuard)
    async update(
        @Param('id') id: string,
        @Body() updateSiteDto: UpdateSiteDto,
        @Request() req: IAuthenticatedRequest
    ) {
        const userId = req.user?.sub
        return await this.siteService.update(id, updateSiteDto, userId);
    }

    @Delete('delete/:id')
    @UseGuards(AuthGuard)
    async delete(
        @Param('id') id: string,
        @Request() req: IAuthenticatedRequest
    ) {
        const userId = req.user?.sub
        await this.siteService.delete(id, userId);
        return { message: 'Site deleted successfully' };
    }
}
