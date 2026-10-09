import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  ParseUUIDPipe,
  UsePipes,
  ValidationPipe,
  Patch
} from '@nestjs/common';
import { CareFacilityService } from '@/careFacility/careFacility.service';
import { CreateCareFacilityDto } from '@/careFacility/dto/CreateCareFacilityDto';
import { UpdateCareFacilityDto } from '@/careFacility/dto/UpdateCareFacilityDto';
import { SearchCareFacilityDto } from '@/careFacility/dto/SearchCareFacilityDto';
import { ICareFacilityResponse, IPaginatedResponse, IServiceResponse } from '@/types/careFacility';

@Controller('care-facilities')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class CareFacilityController {
  constructor(private readonly careFacilityService: CareFacilityService) {}

  // Create a new care facility
  @Post('addCareFacility')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createDto: CreateCareFacilityDto
  ): Promise<IServiceResponse<ICareFacilityResponse>> {
    return await this.careFacilityService.create(createDto);
  }

  // Get all care facilities
  @Get('allCareFacility')
  @HttpCode(HttpStatus.OK)
  async getAll(): Promise<IServiceResponse<ICareFacilityResponse[]>> {
    return await this.careFacilityService.getAll();
  }

  // Search care facilities with filters and pagination
  @Get('search')
  @HttpCode(HttpStatus.OK)
  async search(
    @Query() searchDto: SearchCareFacilityDto
  ): Promise<IServiceResponse<IPaginatedResponse<ICareFacilityResponse>>> {
    return await this.careFacilityService.search(searchDto);
  }

  // Get care facility by ID
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getById(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<IServiceResponse<ICareFacilityResponse>> {
    return await this.careFacilityService.getById(id);
  }


  // Update care facility
  @Patch('updateCareFacility/:id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateCareFacilityDto
  ): Promise<IServiceResponse<ICareFacilityResponse>> {
    return await this.careFacilityService.update(id, updateDto);
  }

  // Delete care facility
  @Delete('deleteFacility/:id')
  @HttpCode(HttpStatus.OK)
  async delete(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<IServiceResponse<null>> {
    return await this.careFacilityService.delete(id);
  }
}