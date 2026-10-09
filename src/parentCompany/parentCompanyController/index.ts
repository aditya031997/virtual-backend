import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { ParentCompanyService } from '@/parentCompany/parentCompanyService';
import { CreateParentCompanyDto, UpdateParentCompanyDto } from '@/parentCompany/dto';
import { AuthGuard } from '@/common/guards/auth.guard';
import type { IAuthenticatedRequest } from '@/types';

@UseGuards(AuthGuard)
@Controller('parent-companies')
export class ParentCompanyController {
    constructor(private readonly parentCompanyService: ParentCompanyService) { }

    @Post('create')
    async create(
        @Body() createParentCompanyDto: CreateParentCompanyDto,
        @Request() req: IAuthenticatedRequest
    ) {
        const userId = req.user?.sub
        return await this.parentCompanyService.create(createParentCompanyDto, userId);
    }

    @Get('search')
    async searchByName(
        @Query('companyName') companyName: string,
        @Request() req: IAuthenticatedRequest
    ) {
        const userId = req.user?.sub;
        return await this.parentCompanyService.searchByName(companyName, userId);
    }

    @Get('allParentCompanies')
    async findAll(@Request() req: IAuthenticatedRequest) {
        const userId = req.user?.sub
        return await this.parentCompanyService.findAll(userId);
    }

    @Get('getById/:id')
    async findById(
        @Param('id') id: string,
        @Request() req: IAuthenticatedRequest
    ) {
        const userId = req.user?.sub
        return await this.parentCompanyService.findById(id, userId);
    }

    @Put('update/:id')
    async update(
        @Param('id') id: string,
        @Body() updateParentCompanyDto: UpdateParentCompanyDto,
        @Request() req: IAuthenticatedRequest
    ) {
        const userId = req.user?.sub
        return await this.parentCompanyService.update(id, updateParentCompanyDto, userId);
    }

    @Delete('delete/:id')
    async delete(
        @Param('id') id: string,
        @Request() req: IAuthenticatedRequest
    ) {
        const userId = req.user?.sub
        await this.parentCompanyService.delete(id, userId);
        return { message: 'Parent company deleted successfully' };
    }
}
