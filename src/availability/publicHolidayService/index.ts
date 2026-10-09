import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PublicHolidays } from '@/schema';
import {
    CreatePublicHolidayDto,
    UpdatePublicHolidayDto,
    PublicHolidayResponseDto
} from '@/availability';
import {
    CreatePublicHolidaysResponse,
    UpdatePublicHolidaysResponse,
    DeletePublicHolidaysResponse,
    PublicHolidaysResponse
} from '@/types';
import { AuditFileLoggerService } from '@/auditLog';

@Injectable()
export class PublicHolidaysService {
    constructor(
        @InjectRepository(PublicHolidays)
        private publicHolidaysRepository: Repository<PublicHolidays>,
        private readonly auditFileLogger: AuditFileLoggerService,
    ) { }

    async create(createDto: CreatePublicHolidayDto): Promise<CreatePublicHolidaysResponse> {
        // Check for duplicate holiday name
        const existingHolidayWithName = await this.publicHolidaysRepository.findOne({
            where: {
                holidayName: createDto.holidayName,
                userId: createDto.userId
            }
        });

        if (existingHolidayWithName) {
            throw new ConflictException(`Holiday with name "${createDto.holidayName}" already exists`);
        }

        // Check for overlapping date ranges using QueryBuilder (most efficient approach)
        const overlappingHolidays = await this.publicHolidaysRepository
            .createQueryBuilder('holiday')
            .where('holiday.userId = :userId', { userId: createDto.userId })
            .andWhere(
                '(holiday.startDate <= :endDate AND holiday.endDate >= :startDate)',
                {
                    startDate: createDto.startDate,
                    endDate: createDto.endDate
                }
            )
            .getMany();

        if (overlappingHolidays.length > 0) {
            const conflictingHoliday = overlappingHolidays[0];
            throw new ConflictException(
                `Holiday period already exists  "${conflictingHoliday.holidayName}" 
                ${conflictingHoliday.startDate} to ${conflictingHoliday.endDate}. Please select different dates.`
            );
        }

        // If all validations pass, create the holiday
        const publicHoliday = this.publicHolidaysRepository.create({
            ...createDto,
            startTime: createDto.startTime || '00:00',
            endTime: createDto.endTime || '23:59',
            isActive: createDto.isActive !== undefined ? createDto.isActive : true
        });

        const saved = await this.publicHolidaysRepository.save(publicHoliday);
        const data = this.mapToResponseDto(saved);
        this.auditFileLogger.logPublicHoliday({
            action: 'CREATE',
            userId: createDto.userId,
            entityId: saved.id,
            after: data,
        });

        return {
            success: true,
            message: `Holiday "${saved.holidayName}" created successfully`,
            data,
        };
    }

    async findAll(): Promise<PublicHolidayResponseDto[]> {
        const holidays = await this.publicHolidaysRepository.find({
            where: { isActive: true },
            relations: ['user'],
            order: { startDate: 'ASC' }
        });
        return holidays.map(this.mapToResponseDto);
    }

    async findOne(id: string): Promise<PublicHolidayResponseDto> {
        const holiday = await this.publicHolidaysRepository.findOne({
            where: { id, isActive: true },
            relations: ['user']
        });

        if (!holiday) {
            throw new NotFoundException(`Public holiday with ID ${id} not found`);
        }

        return this.mapToResponseDto(holiday);
    }

    /**
     * Find holidays that overlap a given date range.
     * startDate/endDate are expected as YYYY-MM-DD strings so comparisons are done on date only
     * and are not affected by timezone conversions.
     */
    async findByDateRange(startDate: string, endDate: string): Promise<PublicHolidayResponseDto[]> {
        const holidays = await this.publicHolidaysRepository
            .createQueryBuilder('holiday')
            .leftJoinAndSelect('holiday.user', 'user')
            .where('holiday.startDate <= :endDate::date AND holiday.endDate >= :startDate::date', {
                startDate,
                endDate,
            })
            .andWhere('holiday.isActive = :isActive', { isActive: true })
            .orderBy('holiday.startDate', 'ASC')
            .getMany();

        return holidays.map(this.mapToResponseDto);
    }

    async findCurrentYearHolidays(): Promise<PublicHolidayResponseDto[]> {
        const currentYear = new Date().getFullYear();
        const startDate = `${currentYear}-01-01`;
        const endDate = `${currentYear}-12-31`;

        return this.findByDateRange(startDate, endDate);
    }

    async update(id: string, updateDto: UpdatePublicHolidayDto): Promise<UpdatePublicHolidaysResponse> {
        const holiday = await this.publicHolidaysRepository.findOne({
            where: { id, isActive: true }
        });

        if (!holiday) {
            throw new NotFoundException(`Public holiday with ID ${id} not found`);
        }

        const before = this.mapToResponseDto(holiday);
        await this.publicHolidaysRepository.update(id, updateDto);
        const updated = await this.publicHolidaysRepository.findOne({
            where: { id },
            relations: ['user']
        });

        if (!updated) {
            throw new NotFoundException(`Public holiday with ID ${id} not found after update`);
        }

        const data = this.mapToResponseDto(updated);
        this.auditFileLogger.logPublicHoliday({
            action: 'UPDATE',
            userId: updated.userId,
            entityId: id,
            before,
            after: data,
        });

        return {
            success: true,
            message: `Holiday "${updated.holidayName}" updated successfully`,
            data,
        };
    }

    async remove(id: string): Promise<DeletePublicHolidaysResponse> {
        const holiday = await this.publicHolidaysRepository.findOne({
            where: { id }
        });

        if (!holiday) {
            throw new NotFoundException(`Public holiday with ID ${id} not found`);
        }

        const before = this.mapToResponseDto(holiday);
        await this.publicHolidaysRepository.remove(holiday);
        this.auditFileLogger.logPublicHoliday({
            action: 'DELETE',
            userId: holiday.userId,
            entityId: id,
            before,
        });
        return {
            success: true,
            message: `Holiday "${holiday.holidayName}" deleted successfully`
        };
    }


    private mapToResponseDto(holiday: PublicHolidays): PublicHolidaysResponse {
        return {
            id: holiday.id,
            holidayName: holiday.holidayName,
            startDate: holiday.startDate,
            endDate: holiday.endDate,
            startTime: holiday.startTime,
            endTime: holiday.endTime,
            isActive: holiday.isActive,
            userId: holiday.userId,
            createdAt: holiday.createdAt,
            updatedAt: holiday.updatedAt,
        };
    }
}