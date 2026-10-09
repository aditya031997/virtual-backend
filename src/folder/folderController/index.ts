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
    HttpCode,
    HttpStatus,
    Req,
    ParseUUIDPipe
} from '@nestjs/common';
import { FolderService } from '@/folder/folderService';
import { CreateFolderDto, UpdateFolderDto, FolderQueryDto } from '@/folder/dto';
import { AuthGuard } from '@/common/guards/auth.guard';
import type { IAuthenticatedRequest, IFolderResponse, IFolderDeleteResponse } from '@/types';

@Controller('folders')
@UseGuards(AuthGuard)
export class FolderController {
    constructor(private readonly folderService: FolderService) {}

    @Post('create')
    @HttpCode(HttpStatus.CREATED)
    async create(
        @Body() createFolderDto: CreateFolderDto,
        @Req() req: IAuthenticatedRequest
    ): Promise<IFolderResponse> {
        const userId = req.user.sub;
        const folder = await this.folderService.create(createFolderDto, userId);
        
        return {
            success: true,
            message: 'Folder created successfully',
            data: folder,
        };
    }

 @Get('allFolders')
async findAll(
    @Query() query: FolderQueryDto,
    @Req() req: IAuthenticatedRequest
): Promise<IFolderResponse> {
    const userId = req.user.sub;
    const folders = await this.folderService.findAll(userId, query);
    
    return {
        success: true,
        message: `Retrieved ${folders.length} folder(s) successfully`,
        data: folders,
    };
}

    @Get('getById/:id')
    async findOne(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: IAuthenticatedRequest
    ): Promise<IFolderResponse> {
        const userId = req.user.sub;
        const folder = await this.folderService.findOne(id, userId);
        
        return {
            success: true,
            message: 'Folder retrieved successfully',
            data: folder,
        };
    }

    @Patch('update/:id')
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateFolderDto: UpdateFolderDto,
        @Req() req: IAuthenticatedRequest
    ): Promise<IFolderResponse> {
        const userId = req.user.sub;
        const folder = await this.folderService.update(id, updateFolderDto, userId);
        
        return {
            success: true,
            message: 'Folder updated successfully',
            data: folder,
        };
    }

    @Delete('delete/:id')
    @HttpCode(HttpStatus.OK)
    async remove(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: IAuthenticatedRequest
    ): Promise<IFolderDeleteResponse> {
        const userId = req.user.sub;
        
        // Use the cascading delete method that also deletes documents and FAQs
        const result = await this.folderService.removeWithDocuments(id, userId);
        
        return {
            success: result.success,
            message: result.message,
            data: {
                deletedDocuments: result.deletedDocuments,
                deletedFaqs: result.deletedFaqs,
                deletedFromKnowledgeBase: result.deletedFromKnowledgeBase,
                ...(result.errors && result.errors.length > 0 && { errors: result.errors }),
            },
        };
    }
}