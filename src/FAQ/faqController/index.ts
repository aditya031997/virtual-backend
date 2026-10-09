import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus,
    UseGuards,
    Req,
    ParseUUIDPipe,
} from '@nestjs/common';
import { FaqService } from '@/FAQ/faqService';
import { CreateFaqDto, UpdateFaqDto, FaqQueryDto } from '@/FAQ/dto';
import { AuthGuard } from '@/common/guards/auth.guard';
import type { IAuthenticatedRequest, IApiResponse, IFaq } from '@/types';
import { FAQ } from '@/schema';

@Controller('faq')
@UseGuards(AuthGuard)
export class FaqController {
    constructor(private readonly faqService: FaqService) { }

    @Post('create')
    @HttpCode(HttpStatus.CREATED)
    async create(
        @Body() createFaqDto: CreateFaqDto,
        @Req() req: IAuthenticatedRequest,
    ): Promise<IApiResponse<FAQ>> {
        const dataWithUserId = {
            ...createFaqDto,
            userId: req.user.sub
        };
        const faq = await this.faqService.create(dataWithUserId);
        return {
            success: true,
            message: 'FAQ created successfully',
            data: faq
        };
    }

    @Get('allFaq')
    @HttpCode(HttpStatus.OK)
    async findAll(@Req() req: IAuthenticatedRequest): Promise<IApiResponse<FAQ[]>> {
        const userId = req.user.sub;
        const faqs = await this.faqService.findAll(userId);
        return {
            success: true,
            message: `Retrieved ${faqs.length} FAQ(s) successfully`,
            data: faqs
        };
    }

    @Get('getByFolder')
    async findByFolder(
        @Query('folderId', ParseUUIDPipe) folderId: string,
        @Req() req: IAuthenticatedRequest
    ): Promise<IApiResponse<IFaq[]>> {
        const userId = req.user.sub;
        const faqs = await this.faqService.findByFolder(folderId, userId);

        return {
            success: true,
            message: `Retrieved ${faqs.length} FAQ(s) for folder successfully`,
            data: faqs,
        };
    }

    @Get('getByDocument')
    async findByDocument(
        @Query('documentId') documentId: string,
        @Req() req: IAuthenticatedRequest
    ): Promise<IApiResponse<IFaq[]>> {
        const userId = req.user.sub;
        const faqs = await this.faqService.findByDocument(documentId, userId);

        return {
            success: true,
            message: `Retrieved ${faqs.length} FAQ(s) for document successfully`,
            data: faqs,
        };
    }

    @Get('getById/:id')
    @HttpCode(HttpStatus.OK)
    async findById(
        @Param('id') id: string,
        @Req() req: IAuthenticatedRequest,
    ): Promise<IApiResponse<FAQ>> {
        const userId = req.user.sub;
        const faq = await this.faqService.findById(id, userId);
        return {
            success: true,
            message: 'FAQ retrieved successfully',
            data: faq
        };
    }

    @Patch('update/:id')
    @HttpCode(HttpStatus.OK)
    async update(
        @Param('id') id: string,
        @Body() updateFaqDto: UpdateFaqDto,
        @Req() req: IAuthenticatedRequest,
    ): Promise<IApiResponse<FAQ>> {
        const userId = req.user.sub;
        const faq = await this.faqService.update(id, updateFaqDto, userId);
        return {
            success: true,
            message: 'FAQ updated successfully',
            data: faq
        };
    }

    @Delete('delete/:id')
    @HttpCode(HttpStatus.OK)
    async delete(
        @Param('id') id: string,
        @Req() req: IAuthenticatedRequest,
    ): Promise<IApiResponse<null>> {
        const userId = req.user.sub;
        await this.faqService.delete(id, userId);
        return {
            success: true,
            message: 'FAQ deleted successfully',
            data: null
        };
    }
}