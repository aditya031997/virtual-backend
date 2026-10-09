import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AfterHours } from '@/schema';
import {
  CreateAfterHoursDto,
  UpdateAfterHoursDto,
  BulkUpdateAfterHoursDto,
  AfterHoursResponseDto,
  ToggleAfterHoursAvailabilityDto
} from '@/availability';
import {
  CreateAfterHoursResponse,
  UpdateAfterHoursResponse,
  DeleteAfterHoursResponse,
  BulkUpdateAfterHoursResponse,
  AfterHoursResponse,
  ToggleAfterAvailabilityResponse
} from '@/types';
import { AuditFileLoggerService } from '@/auditLog';

@Injectable()
export class AfterHoursService {
  constructor(
    @InjectRepository(AfterHours)
    private afterHoursRepository: Repository<AfterHours>,
    private readonly auditFileLogger: AuditFileLoggerService,
  ) { }

  async create(createDto: CreateAfterHoursDto): Promise<CreateAfterHoursResponse> {
    const existingSchedule = await this.afterHoursRepository.findOne({
      where: { dayOfWeek: createDto.dayOfWeek.toLowerCase(), userId: createDto.userId }
    });

    if (existingSchedule) {
      throw new BadRequestException(`After hours for ${createDto.dayOfWeek} already exists for this user`);
    }

    const afterHours = this.afterHoursRepository.create({
      ...createDto,
      dayOfWeek: createDto.dayOfWeek.toLowerCase(),
      isAvailable: createDto.isAvailable ?? true
    });

    const saved = await this.afterHoursRepository.save(afterHours);
    const data = this.mapToResponseDto(saved);
    this.auditFileLogger.logAfterHours({
      action: 'CREATE',
      userId: createDto.userId,
      entityId: saved.id,
      after: data,
    });

    return {
      success: true,
      message: `After hours for ${saved.dayOfWeek} created successfully`,
      data,
    };
  }

  async findByDayAndUser(dayOfWeek: string, userId: string): Promise<AfterHoursResponseDto | null> {
    const afterHours = await this.afterHoursRepository.findOne({
      where: { dayOfWeek: dayOfWeek.toLowerCase(), userId },
      relations: ['user'],
    });
    return afterHours ? this.mapToResponseDto(afterHours) : null;
  }

  /** Find one record for the given day (any user). Used for public current-day API. */
  async findByDay(dayOfWeek: string): Promise<AfterHoursResponseDto | null> {
    const afterHours = await this.afterHoursRepository.findOne({
      where: { dayOfWeek: dayOfWeek.toLowerCase() },
      relations: ['user'],
    });
    return afterHours ? this.mapToResponseDto(afterHours) : null;
  }

  async findAll(): Promise<AfterHoursResponseDto[]> {
    const afterHours = await this.afterHoursRepository.find({
      relations: ['user'],
      order: {
        dayOfWeek: 'ASC',
        createdAt: 'DESC'
      }
    });
    return afterHours.map(this.mapToResponseDto);
  }

  async findOne(id: string): Promise<AfterHoursResponseDto> {
    const afterHours = await this.afterHoursRepository.findOne({
      where: { id, isAvailable: true },
      relations: ['user']
    });

    if (!afterHours) {
      throw new NotFoundException(`After hours with ID ${id} not found`);
    }

    return this.mapToResponseDto(afterHours);
  }

  async update(id: string, updateDto: UpdateAfterHoursDto): Promise<UpdateAfterHoursResponse> {
    const afterHours = await this.afterHoursRepository.findOne({
      where: { id }
    });

    if (!afterHours) {
      throw new NotFoundException(`After hours with ID ${id} not found`);
    }

    const before = this.mapToResponseDto(afterHours);
    const updateData = { ...updateDto };
    if (updateDto.dayOfWeek) {
      updateData.dayOfWeek = updateDto.dayOfWeek.toLowerCase();
    }

    await this.afterHoursRepository.update(id, updateData);
    const updated = await this.afterHoursRepository.findOne({
      where: { id },
      relations: ['user']
    });

    if (!updated) {
      throw new NotFoundException(`After hours with ID ${id} not found after update`);
    }

    const data = this.mapToResponseDto(updated);
    this.auditFileLogger.logAfterHours({
      action: 'UPDATE',
      userId: updated.userId,
      entityId: id,
      before,
      after: data,
    });

    return {
      success: true,
      message: `After hours for ${updated.dayOfWeek} updated successfully`,
      data,
    };
  }

  async toggleAvailability(id: string, toggleDto: ToggleAfterHoursAvailabilityDto): Promise<ToggleAfterAvailabilityResponse> {
    const businessHours = await this.afterHoursRepository.findOne({
      where: { id },
      relations: ['user']
    });

    if (!businessHours) {
      throw new NotFoundException(`Business hours with ID ${id} not found`);
    }

    const before = this.mapToResponseDto(businessHours);

    // Only update isAvailable field
    await this.afterHoursRepository.update(id, {
      isAvailable: toggleDto.isAvailable
    });

    // Fetch the updated record to return current state
    const updated = await this.afterHoursRepository.findOne({
      where: { id },
      relations: ['user']
    });

    if (!updated) {
      throw new NotFoundException(`Business hours with ID ${id} not found after toggle`);
    }

    const action = toggleDto.isAvailable ? 'enabled' : 'disabled';
    const data = this.mapToResponseDto(updated);
    this.auditFileLogger.logAfterHours({
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

  async bulkUpdate(bulkUpdateDto: BulkUpdateAfterHoursDto): Promise<BulkUpdateAfterHoursResponse> {
    const results: AfterHoursResponse[] = [];

    for (const schedule of bulkUpdateDto.schedules) {
      const dayOfWeek = schedule.dayOfWeek.toLowerCase();

      if (schedule.id) {
        // UPDATE existing record by ID
        const existingSchedule = await this.afterHoursRepository.findOne({
          where: { id: schedule.id }
        });

        if (!existingSchedule) {
          throw new NotFoundException(`After hours with ID ${schedule.id} not found`);
        }

        await this.afterHoursRepository.update(schedule.id, {
          dayOfWeek,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          isAvailable: schedule.isAvailable,
        });

        const updated = await this.afterHoursRepository.findOne({
          where: { id: schedule.id },
          relations: ['user']
        });

        if (updated) {
          results.push(this.mapToResponseDto(updated));
        }
      } else {
        // CREATE new or UPDATE by dayOfWeek
        let existingSchedule = await this.afterHoursRepository.findOne({
          where: {
            dayOfWeek,
            ...(bulkUpdateDto.userId && { userId: bulkUpdateDto.userId })
          }
        });

        if (existingSchedule) {
          // Update existing
          await this.afterHoursRepository.update(existingSchedule.id, {
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            isAvailable: schedule.isAvailable,
          });

          const updated = await this.afterHoursRepository.findOne({
            where: { id: existingSchedule.id },
            relations: ['user']
          });
          if (updated) {
            results.push(this.mapToResponseDto(updated));
          }
        } else {
          // Create new - userId is required for new records
          if (!bulkUpdateDto.userId) {
            throw new BadRequestException(`userId is required when creating new after hours for ${dayOfWeek}`);
          }

          const newSchedule = this.afterHoursRepository.create({
            dayOfWeek,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            isAvailable: schedule.isAvailable,
            userId: bulkUpdateDto.userId,
          });

          const saved = await this.afterHoursRepository.save(newSchedule);
          results.push(this.mapToResponseDto(saved));
        }
      }
    }

    this.auditFileLogger.logAfterHours({
      action: 'BULK_UPDATE',
      userId: bulkUpdateDto.userId,
      after: results,
      details: { scheduleCount: results.length },
    });

    return {
      success: true,
      message: `After hours updated successfully for ${results.length} days`,
      data: results
    };
  }

  async remove(id: string): Promise<DeleteAfterHoursResponse> {
    const afterHours = await this.afterHoursRepository.findOne({
      where: { id, isAvailable: true }
    });

    if (!afterHours) {
      throw new NotFoundException(`After hours with ID ${id} not found`);
    }

    const before = this.mapToResponseDto(afterHours);
    await this.afterHoursRepository.update(id, { isAvailable: false });
    this.auditFileLogger.logAfterHours({
      action: 'DELETE',
      userId: afterHours.userId,
      entityId: id,
      before,
    });

    return {
      success: true,
      message: `After hours for ${afterHours.dayOfWeek} deleted successfully`
    };
  }

  private mapToResponseDto(afterHours: AfterHours): AfterHoursResponse {
    return {
      id: afterHours.id,
      dayOfWeek: afterHours.dayOfWeek,
      startTime: afterHours.startTime,
      endTime: afterHours.endTime,
      isAvailable: afterHours.isAvailable,
      userId: afterHours.userId,
      createdAt: afterHours.createdAt,
      updatedAt: afterHours.updatedAt,
    };
  }
}