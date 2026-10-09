import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessHours } from '@/schema';
import {
  CreateBusinessHoursDto,
  UpdateBusinessHoursDto,
  BulkUpdateBusinessHoursDto,
  BusinessHoursResponseDto,
  ToggleBusinessHoursAvailabilityDto,
} from '@/availability';
import {
  CreateBusinessHoursResponse,
  UpdateBusinessHoursResponse,
  DeleteBusinessHoursResponse,
  BulkUpdateBusinessHoursResponse,
  BusinessHoursResponse,
  ToggleAvailabilityResponse
} from '@/types';
import { AuditFileLoggerService } from '@/auditLog';

@Injectable()
export class BusinessHoursService {
  constructor(
    @InjectRepository(BusinessHours)
    private businessHoursRepository: Repository<BusinessHours>,
    private readonly auditFileLogger: AuditFileLoggerService,
  ) { }

  async create(createDto: CreateBusinessHoursDto): Promise<CreateBusinessHoursResponse> {
    const existingSchedule = await this.businessHoursRepository.findOne({
      where: { dayOfWeek: createDto.dayOfWeek.toLowerCase(), userId: createDto.userId }
    });

    if (existingSchedule) {
      throw new BadRequestException(`Business hours for ${createDto.dayOfWeek} already exists for this user`);
    }

    const businessHours = this.businessHoursRepository.create({
      ...createDto,
      dayOfWeek: createDto.dayOfWeek.toLowerCase(),
      isAvailable: createDto.isAvailable ?? true
    });

    const saved = await this.businessHoursRepository.save(businessHours);
    const data = this.mapToResponseDto(saved);
    this.auditFileLogger.logBusinessHours({
      action: 'CREATE',
      userId: createDto.userId,
      entityId: saved.id,
      after: data,
    });

    return {
      success: true,
      message: `Business hours for ${saved.dayOfWeek} created successfully`,
      data,
    };
  }

  async findByDayAndUser(dayOfWeek: string, userId: string): Promise<BusinessHoursResponseDto | null> {
    const businessHours = await this.businessHoursRepository.findOne({
      where: { dayOfWeek: dayOfWeek.toLowerCase(), userId },
      relations: ['user'],
    });
    return businessHours ? this.mapToResponseDto(businessHours) : null;
  }

  /** Find one record for the given day (any user). Used for public current-day API. */
  async findByDay(dayOfWeek: string): Promise<BusinessHoursResponseDto | null> {
    const businessHours = await this.businessHoursRepository.findOne({
      where: { dayOfWeek: dayOfWeek.toLowerCase() },
      relations: ['user'],
    });
    return businessHours ? this.mapToResponseDto(businessHours) : null;
  }

  /** Returns only the given user's business hours (one row per day). */
  async findAll(userId: string): Promise<BusinessHoursResponseDto[]> {
    const businessHours = await this.businessHoursRepository.find({
      where: { userId },
      relations: ['user'],
      order: {
        dayOfWeek: 'ASC',
        createdAt: 'DESC'
      }
    });
    return businessHours.map(this.mapToResponseDto);
  }

  async findOne(id: string): Promise<BusinessHoursResponseDto> {
    const businessHours = await this.businessHoursRepository.findOne({
      where: { id, isAvailable: true },
      relations: ['user']
    });

    if (!businessHours) {
      throw new NotFoundException(`Business hours with ID ${id} not found`);
    }

    return this.mapToResponseDto(businessHours);
  }

  async update(id: string, updateDto: UpdateBusinessHoursDto): Promise<UpdateBusinessHoursResponse> {
    const businessHours = await this.businessHoursRepository.findOne({
      where: { id }
    });

    if (!businessHours) {
      throw new NotFoundException(`Business hours with ID ${id} not found`);
    }

    const before = this.mapToResponseDto(businessHours);
    const updateData = { ...updateDto };
    if (updateDto.dayOfWeek) {
      updateData.dayOfWeek = updateDto.dayOfWeek.toLowerCase();
    }

    await this.businessHoursRepository.update(id, updateData);
    const updated = await this.businessHoursRepository.findOne({
      where: { id },
      relations: ['user']
    });

    if (!updated) {
      throw new NotFoundException(`Business hours with ID ${id} not found after update`);
    }

    const data = this.mapToResponseDto(updated);
    this.auditFileLogger.logBusinessHours({
      action: 'UPDATE',
      userId: updated.userId,
      entityId: id,
      before,
      after: data,
    });

    return {
      success: true,
      message: `Business hours for ${updated.dayOfWeek} updated successfully`,
      data,
    };
  }

  async toggleAvailability(id: string, toggleDto: ToggleBusinessHoursAvailabilityDto): Promise<ToggleAvailabilityResponse> {
    const businessHours = await this.businessHoursRepository.findOne({
      where: { id },
      relations: ['user']
    });

    if (!businessHours) {
      throw new NotFoundException(`Business hours with ID ${id} not found`);
    }

    const before = this.mapToResponseDto(businessHours);

    // Only update isAvailable field
    await this.businessHoursRepository.update(id, {
      isAvailable: toggleDto.isAvailable
    });

    // Fetch the updated record to return current state
    const updated = await this.businessHoursRepository.findOne({
      where: { id },
      relations: ['user']
    });

    if (!updated) {
      throw new NotFoundException(`Business hours with ID ${id} not found after toggle`);
    }

    const action = toggleDto.isAvailable ? 'enabled' : 'disabled';
    const data = this.mapToResponseDto(updated);
    this.auditFileLogger.logBusinessHours({
      action: 'TOGGLE',
      userId: updated.userId,
      entityId: id,
      before,
      after: data,
      details: { isAvailable: toggleDto.isAvailable },
    });

    return {
      success: true,
      message: `Business hours for ${updated.dayOfWeek} ${action} successfully`,
      data,
    };
  }

  async bulkUpdate(bulkUpdateDto: BulkUpdateBusinessHoursDto): Promise<BulkUpdateBusinessHoursResponse> {
    const results: BusinessHoursResponse[] = [];

    for (const schedule of bulkUpdateDto.schedules) {
      const dayOfWeek = schedule.dayOfWeek.toLowerCase();

      if (schedule.id) {
        // UPDATE existing record by ID
        const existingSchedule = await this.businessHoursRepository.findOne({
          where: { id: schedule.id }
        });

        if (!existingSchedule) {
          throw new NotFoundException(`Business hours with ID ${schedule.id} not found`);
        }

        await this.businessHoursRepository.update(schedule.id, {
          dayOfWeek,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          isAvailable: schedule.isAvailable,
        });

        const updated = await this.businessHoursRepository.findOne({
          where: { id: schedule.id },
          relations: ['user']
        });

        if (updated) {
          results.push(this.mapToResponseDto(updated));
        }
      } else {
        // CREATE new or UPDATE by dayOfWeek
        let existingSchedule = await this.businessHoursRepository.findOne({
          where: {
            dayOfWeek,
            ...(bulkUpdateDto.userId && { userId: bulkUpdateDto.userId })
          }
        });

        if (existingSchedule) {
          // Update existing
          await this.businessHoursRepository.update(existingSchedule.id, {
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            isAvailable: schedule.isAvailable,
          });

          const updated = await this.businessHoursRepository.findOne({
            where: { id: existingSchedule.id },
            relations: ['user']
          });
          if (updated) {
            results.push(this.mapToResponseDto(updated));
          }
        } else {
          // Create new - userId is required for new records
          if (!bulkUpdateDto.userId) {
            throw new BadRequestException(`userId is required when creating new business hours for ${dayOfWeek}`);
          }

          const newSchedule = this.businessHoursRepository.create({
            dayOfWeek,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            isAvailable: schedule.isAvailable,
            userId: bulkUpdateDto.userId,
          });

          const saved = await this.businessHoursRepository.save(newSchedule);
          results.push(this.mapToResponseDto(saved));
        }
      }
    }

    this.auditFileLogger.logBusinessHours({
      action: 'BULK_UPDATE',
      userId: bulkUpdateDto.userId,
      after: results,
      details: { scheduleCount: results.length },
    });

    return {
      success: true,
      message: `Business hours updated successfully for ${results.length} days`,
      data: results
    };
  }

  async remove(id: string): Promise<DeleteBusinessHoursResponse> {
    const businessHours = await this.businessHoursRepository.findOne({
      where: { id, isAvailable: true }
    });

    if (!businessHours) {
      throw new NotFoundException(`Business hours with ID ${id} not found`);
    }

    const before = this.mapToResponseDto(businessHours);
    await this.businessHoursRepository.update(id, { isAvailable: false });
    this.auditFileLogger.logBusinessHours({
      action: 'DELETE',
      userId: businessHours.userId,
      entityId: id,
      before,
    });

    return {
      success: true,
      message: `Business hours for ${businessHours.dayOfWeek} deleted successfully`
    };
  }

  private mapToResponseDto(businessHours: BusinessHours): BusinessHoursResponse {
    return {
      id: businessHours.id,
      dayOfWeek: businessHours.dayOfWeek,
      startTime: businessHours.startTime,
      endTime: businessHours.endTime,
      isAvailable: businessHours.isAvailable,
      userId: businessHours.userId,
      createdAt: businessHours.createdAt,
      updatedAt: businessHours.updatedAt,
    };
  }
}