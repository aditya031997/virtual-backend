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
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { DealerService } from '@/dealer/dealerService';
import { CreateDealerDto, UpdateDealerDto } from '@/dealer';
import { AuthGuard } from '@/common/guards/auth.guard';
import type { IDealer } from '@/types';
import type { IAuthenticatedRequest } from '@/types';

@Controller('dealers')
// Remove @UseGuards(AuthGuard) from here
export class DealerController {
  constructor(private readonly dealerService: DealerService) { }

  // Create dealer - Protected
  @Post('create')
  @UseGuards(AuthGuard) // Add guard here
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createDealerDto: CreateDealerDto,
    @Req() req: IAuthenticatedRequest
  ): Promise<IDealer> {
    const dataWithUserId = {
      ...createDealerDto,
      userId: req.user.sub
    };
    return await this.dealerService.create(dataWithUserId);
  }

  // Get all dealers - Protected
  @Get('allDealers')
  @UseGuards(AuthGuard) // Add guard here
  async findAll(): Promise<IDealer[]> {
    return await this.dealerService.findAll();
  }

  // Search dealers - Protected
  @Get('search')
  @UseGuards(AuthGuard) // Add guard here
  async search(
    @Query('query') query?: string,
    @Query('name') name?: string,
    @Query('email') email?: string
  ): Promise<IDealer[]> {
    return await this.dealerService.search({ query, name, email });
  }

  // Get dealer by ID - Protected
  @Get('getById/:id')
  @UseGuards(AuthGuard) // Add guard here
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<IDealer> {
    return await this.dealerService.findOne(id);
  }

  // Update dealer - Protected
  @Patch('update/:id')
  @UseGuards(AuthGuard) // Add guard here
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDealerDto: UpdateDealerDto,
  ): Promise<IDealer> {
    return await this.dealerService.update(id, updateDealerDto);
  }

  // Delete dealer - Protected
  @Delete('delete/:id')
  @UseGuards(AuthGuard) // Add guard here
  async remove(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<{ message: string }> {
    return await this.dealerService.remove(id);
  }
}