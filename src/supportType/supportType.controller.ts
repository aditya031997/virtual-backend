import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SupportTypeService } from '@/supportType/supportType.service';
import { CreateSupportTypeDto } from '@/supportType/dto/createSupport.dto';
import { UpdateSupportTypeDto } from '@/supportType/dto/updateSupport.dto';
import { SupportTypeResponseDto } from '@/supportType/dto/support-type-response.dto';
import { AuthGuard } from '@/common/guards/auth.guard';

@Controller('support')
@UseGuards(AuthGuard)
export class SupportTypeController {
  constructor(private readonly supportTypeService: SupportTypeService) {}

  @Post('addSupport')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createSupportTypeDto: CreateSupportTypeDto): Promise<SupportTypeResponseDto> {
    return await this.supportTypeService.create(createSupportTypeDto);
  }

  @Get('allSupport')
  @HttpCode(HttpStatus.OK)
  async getAll(): Promise<SupportTypeResponseDto[]> {
    return await this.supportTypeService.findAll();
  }

  @Get('getSupportById/:id')
  @HttpCode(HttpStatus.OK)
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<SupportTypeResponseDto> {
    return await this.supportTypeService.findOne(id);
  }

  @Patch('updateSupport/:id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSupportTypeDto: UpdateSupportTypeDto,
  ): Promise<SupportTypeResponseDto> {
    return await this.supportTypeService.update(id, updateSupportTypeDto);
  }

  @Delete('deleteSupport/:id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return await this.supportTypeService.remove(id);
  }
}