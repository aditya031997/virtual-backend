import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParentCompany } from '@/schema';
import { User } from '@/schema/user/user.entity';
import { CreateParentCompanyDto, UpdateParentCompanyDto } from '@/parentCompany/dto';
import { EmailValidationService, EmailEntityType } from '@/helper/email-validation';
import { PhoneValidationService, PhoneEntityType } from '@/helper/phone-validation';
import { AuditFileLoggerService } from '@/auditLog';

@Injectable()
export class ParentCompanyService {
    constructor(
        @InjectRepository(ParentCompany)
        private readonly parentCompanyRepository: Repository<ParentCompany>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly emailValidationService: EmailValidationService,
        private readonly phoneValidationService: PhoneValidationService,
        private readonly auditFileLogger: AuditFileLoggerService,
    ) { }

    async create(createParentCompanyDto: CreateParentCompanyDto, userId: string): Promise<ParentCompany> {
        const companyNameTrimmed = createParentCompanyDto.companyName?.trim();
        if (companyNameTrimmed) {
            const allByUser = await this.parentCompanyRepository.find({ where: { userId } });
            const duplicateName = allByUser.some(
                (pc) => pc.companyName?.trim().toLowerCase() === companyNameTrimmed.toLowerCase(),
            );
            if (duplicateName) {
                throw new ConflictException('A parent company with this name already exists');
            }
        }

        // Normalize email (optional)
        const normalizedEmail = createParentCompanyDto.email?.trim() ? createParentCompanyDto.email.toLowerCase().trim() : null;

        if (normalizedEmail) {
            await this.emailValidationService.validateEmailUniquenessForEntity(
                normalizedEmail,
                EmailEntityType.PARENT_COMPANY,
            );
        }

        if (createParentCompanyDto.contactNumber?.trim()) {
            await this.phoneValidationService.validatePhoneUniquenessForEntity(
                createParentCompanyDto.contactNumber.trim(),
                PhoneEntityType.PARENT_COMPANY,
            );
        }

        const contactToStore = createParentCompanyDto.contactNumber?.trim()
            ? this.phoneValidationService.getLocalPhone(createParentCompanyDto.contactNumber.trim()) || null
            : null;

        // Validate user
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new BadRequestException('User not found');
        }

        try {
            const parentCompany = this.parentCompanyRepository.create({
                companyName: createParentCompanyDto.companyName,
                businessAddress: createParentCompanyDto.businessAddress,
                state: createParentCompanyDto.state,
                stateCode: createParentCompanyDto.stateCode,
                city: createParentCompanyDto.city,
                description: createParentCompanyDto.description,
                email: normalizedEmail ?? null,
                contactNumber: contactToStore,
                userId,
            });

            const saved = await this.parentCompanyRepository.save(parentCompany);
            this.auditFileLogger.logParentCompany({
                action: 'CREATE',
                userId,
                entityId: saved.id,
                after: saved,
            });
            return saved;
        } catch (error) {
            // Handle database errors
            if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') {
                throw new BadRequestException('Parent company with this Email already exists');
            }
            throw error;
        }
    }

    async findAll(userId: string): Promise<ParentCompany[]> {
        return await this.parentCompanyRepository.find({
            where: { userId },
            order: { createdAt: 'DESC' }
        });
    }

    async findById(id: string, userId: string): Promise<ParentCompany> {
        const parentCompany = await this.parentCompanyRepository.findOne({
            where: { id, userId }
        });

        if (!parentCompany) {
            throw new NotFoundException('Parent company not found');
        }

        return parentCompany;
    }

    async searchByName(companyName: string, userId: string): Promise<ParentCompany[]> {
        if (!companyName || companyName.trim().length === 0) {
            throw new BadRequestException('Search company name cannot be empty');
        }

        return await this.parentCompanyRepository
            .createQueryBuilder('parentCompany')
            .where('parentCompany.userId = :userId', { userId })
            .andWhere('LOWER(parentCompany.companyName) LIKE LOWER(:companyName)', {
                companyName: `%${companyName}%`
            })
            .orderBy('parentCompany.createdAt', 'DESC')
            .getMany();
    }

    async update(id: string, updateParentCompanyDto: UpdateParentCompanyDto, userId: string): Promise<ParentCompany> {
        const parentCompany = await this.findById(id, userId);
        const before = { ...parentCompany };

        // Check if company name is being updated and ensure uniqueness per user
        if (updateParentCompanyDto.companyName !== undefined) {
            const companyNameTrimmed = updateParentCompanyDto.companyName?.trim();
            if (companyNameTrimmed) {
                const allByUser = await this.parentCompanyRepository.find({ where: { userId } });
                const duplicateName = allByUser.some(
                    (pc) => pc.id !== id && pc.companyName?.trim().toLowerCase() === companyNameTrimmed.toLowerCase(),
                );
                if (duplicateName) {
                    throw new ConflictException('A parent company with this name already exists');
                }
            }
        }

        // Normalize incoming values
        const normalizedEmail =
            updateParentCompanyDto.email !== undefined && updateParentCompanyDto.email?.trim()
                ? updateParentCompanyDto.email.toLowerCase().trim()
                : null;

        const contactStr =
            updateParentCompanyDto.contactNumber !== undefined && updateParentCompanyDto.contactNumber !== null
                ? String(updateParentCompanyDto.contactNumber)
                : null;
        const localUpdate = contactStr ? this.phoneValidationService.getLocalPhone(contactStr) : '';

        // Run email + phone validation in parallel whenever values are provided.
        // This guarantees we can report both errors at once.
        const validationErrors: { email?: string; contactNumber?: string } = {};

        if (normalizedEmail || localUpdate) {
            const [emailResult, phoneResult] = await Promise.allSettled([
                normalizedEmail
                    ? this.emailValidationService.validateEmailUniquenessForEntity(
                        normalizedEmail,
                        EmailEntityType.PARENT_COMPANY,
                        id,
                    )
                    : Promise.resolve(),
                localUpdate
                    ? this.phoneValidationService.validatePhoneUniquenessForEntity(
                        contactStr as string,
                        PhoneEntityType.PARENT_COMPANY,
                        id,
                    )
                    : Promise.resolve(),
            ]);

            if (emailResult.status === 'rejected') {
                const msg =
                    (emailResult.reason as any)?.response?.message ||
                    (emailResult.reason as Error)?.message ||
                    'This Email is already registered as a Parent Company';
                validationErrors.email =
                    typeof msg === 'string' ? msg : 'This Email is already registered as a Parent Company';
            }
            if (phoneResult.status === 'rejected') {
                const msg =
                    (phoneResult.reason as any)?.response?.message ||
                    (phoneResult.reason as Error)?.message ||
                    'This phone number is already registered as a Parent Company';
                validationErrors.contactNumber =
                    typeof msg === 'string' ? msg : 'This phone number is already registered as a Parent Company';
            }

            if (Object.keys(validationErrors).length > 0) {
                throw new ConflictException({
                    message: 'Validation failed',
                    errors: validationErrors,
                });
            }
        }

        if (updateParentCompanyDto.email !== undefined) {
            (updateParentCompanyDto as { email?: string | null }).email = normalizedEmail;
        }
        if (updateParentCompanyDto.contactNumber !== undefined) {
            (updateParentCompanyDto as { contactNumber?: string | null }).contactNumber = localUpdate || null;
        }

        try {
            Object.assign(parentCompany, updateParentCompanyDto);
            const saved = await this.parentCompanyRepository.save(parentCompany);
            this.auditFileLogger.logParentCompany({
                action: 'UPDATE',
                userId,
                entityId: id,
                before,
                after: saved,
            });
            return saved;
        } catch (error) {
            if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') {
                throw new BadRequestException('Parent company with this Email already exists');
            }
            throw error;
        }
    }

    async delete(id: string, userId: string): Promise<void> {
        const parentCompany = await this.findById(id, userId);
        const before = { ...parentCompany };
        await this.parentCompanyRepository.remove(parentCompany);
        this.auditFileLogger.logParentCompany({
            action: 'DELETE',
            userId,
            entityId: id,
            before,
        });
    }
}