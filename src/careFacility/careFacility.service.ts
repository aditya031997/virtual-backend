import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike } from 'typeorm';
import { CareFacility } from '@/schema';
import { CreateCareFacilityDto } from './dto/CreateCareFacilityDto';
import { UpdateCareFacilityDto } from './dto/UpdateCareFacilityDto';
import { SearchCareFacilityDto } from './dto/SearchCareFacilityDto';
import { ICareFacilityResponse, IPaginatedResponse, IServiceResponse } from '../types/careFacility';

@Injectable()
export class CareFacilityService {
  constructor(
    @InjectRepository(CareFacility)
    private readonly careFacilityRepository: Repository<CareFacility>,
  ) { }

  // Create Care Facility
  async create(createDto: CreateCareFacilityDto): Promise<IServiceResponse<ICareFacilityResponse>> {
    try {
      // Check if facility code already exists
      const existingFacility = await this.careFacilityRepository.findOne({
        where: { facilityCode: createDto.facilityCode }
      });

      if (existingFacility) {
        throw new ConflictException('Facility code already exists');
      }

      const facility = this.careFacilityRepository.create({
        ...createDto,
        agentAssignments: createDto.agentAssignments || []
      });

      const savedFacility = await this.careFacilityRepository.save(facility);
      const facilityWithUser = await this.getById(savedFacility.id);

      return {
        success: true,
        message: 'Care facility created successfully',
        data: facilityWithUser.data
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create care facility',
        error: error.message
      };
    }
  }

  // Get All Care Facilities
  async getAll(): Promise<IServiceResponse<ICareFacilityResponse[]>> {
    try {
      const facilities = await this.careFacilityRepository.find({
        relations: ['user'],
        order: { createdAt: 'DESC' }
      });

      return {
        success: true,
        message: 'Care facilities retrieved successfully',
        data: facilities
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retrieve care facilities',
        error: error.message
      };
    }
  }

  // Get Care Facility by ID
  async getById(id: string): Promise<IServiceResponse<ICareFacilityResponse>> {
    try {
      const facility = await this.careFacilityRepository.findOne({
        where: { id },
        relations: ['user']
      });

      if (!facility) {
        throw new NotFoundException('Care facility not found');
      }

      return {
        success: true,
        message: 'Care facility retrieved successfully',
        data: facility
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retrieve care facility',
        error: error.message
      };
    }
  }

  async update(id: string, updateDto: UpdateCareFacilityDto): Promise<IServiceResponse<ICareFacilityResponse>> {
    try {
      const facilityResult = await this.getById(id);
      if (!facilityResult.success) {
        return facilityResult;
      }

      const facility = facilityResult.data;

      if (!facility) {
        return { // ✅ Add this return
          success: false,
          message: 'Care facility not found',
          error: 'Facility data is undefined'
        };
      }

      // Check facility code uniqueness
      if (updateDto.facilityCode && updateDto.facilityCode !== facility.facilityCode) {
        const existingFacility = await this.careFacilityRepository.findOne({
          where: { facilityCode: updateDto.facilityCode }
        });

        if (existingFacility) {
          throw new ConflictException('Facility code already exists');
        }
      }

      // Update facility
      await this.careFacilityRepository.update(id, updateDto);
      const updatedFacility = await this.getById(id);

      return { // ✅ Make sure this return exists
        success: true,
        message: 'Care facility updated successfully',
        data: updatedFacility.data
      };
    } catch (error) {
      return { // ✅ Make sure this return exists
        success: false,
        message: 'Failed to update care facility',
        error: error.message
      };
    }
    // ✅ No code path should reach here without returning
  }

  // Delete Care Facility
  async delete(id: string): Promise<IServiceResponse<null>> {
    try {
      const facilityResult = await this.getById(id);
      if (!facilityResult.success) {
        return {
          success: false,
          message: 'Care facility not found',
          error: 'Facility does not exist'
        };
      }

      await this.careFacilityRepository.delete(id);

      return {
        success: true,
        message: 'Care facility deleted successfully',
        data: null
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete care facility',
        error: error.message
      };
    }
  }

  // Search Care Facilities
  async search(searchDto: SearchCareFacilityDto): Promise<IServiceResponse<IPaginatedResponse<ICareFacilityResponse>>> {
    try {
      const { page = 1, limit = 10, ...filters } = searchDto;
      const skip = (page - 1) * limit;

      // Build where conditions
      const whereConditions: any = {};

      if (filters.facilityCode) {
        whereConditions.facilityCode = ILike(`%${filters.facilityCode}%`);
      }

      if (filters.facilityName) {
        whereConditions.facilityName = ILike(`%${filters.facilityName}%`);
      }

      if (filters.reseller) {
        whereConditions.reseller = ILike(`%${filters.reseller}%`);
      }

      if (filters.isActive !== undefined) {
        whereConditions.isActive = filters.isActive;
      }

      if (filters.userId) {
        whereConditions.userId = filters.userId;
      }

      // Get data with pagination
      const [facilities, total] = await this.careFacilityRepository.findAndCount({
        where: whereConditions,
        relations: ['user'],
        skip,
        take: limit,
        order: { createdAt: 'DESC' }
      });

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        message: 'Search completed successfully',
        data: {
          data: facilities,
          total,
          page,
          limit,
          totalPages
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Search failed',
        error: error.message
      };
    }
  }

  // Get facilities by User ID
  async getByUserId(userId: string): Promise<IServiceResponse<ICareFacilityResponse[]>> {
    try {
      const facilities = await this.careFacilityRepository.find({
        where: { userId },
        relations: ['user'],
        order: { createdAt: 'DESC' }
      });

      return {
        success: true,
        message: 'User facilities retrieved successfully',
        data: facilities
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retrieve user facilities',
        error: error.message
      };
    }
  }
}