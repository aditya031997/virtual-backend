import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, Brackets } from 'typeorm';
import { Site, ParentCompany, Dealer } from '@/schema';
import { User } from '@/schema/user/user.entity';
import { CreateSiteDto, UpdateSiteDto } from '@/site';
import { EmailValidationService, EmailEntityType } from '@/helper/email-validation';
import { PhoneValidationService, PhoneEntityType } from '@/helper/phone-validation';
import { AuditFileLoggerService } from '@/auditLog';

/** Response shape for getBySiteName: site id/name/email/contact + dealer code/name/phone/email */
export interface SiteByNameResponse {
    id: string;
    siteName: string;
    email: string | null;
    contactNumber: string | null;
    assignedDealer: {
        dealerCode: string;
        dealerName: string;
        phone: string;
        email: string;
    } | null;
}

@Injectable()
export class SiteService {
    constructor(
        @InjectRepository(Site)
        private readonly siteRepository: Repository<Site>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(ParentCompany)
        private readonly parentCompanyRepository: Repository<ParentCompany>,
        @InjectRepository(Dealer)
        private readonly dealerRepository: Repository<Dealer>,
        private readonly emailValidationService: EmailValidationService,
        private readonly phoneValidationService: PhoneValidationService,
        private readonly auditFileLogger: AuditFileLoggerService,
    ) {}

    private normalizeSiteName(value: string): string {
        return value.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    private normalizeLookupPhone(value: string): string {
        return this.phoneValidationService.getLocalPhone(value);
    }

    private trimLeadingZero(value: string): string {
        return value.replace(/^0+/, '');
    }

    async create(createSiteDto: CreateSiteDto, userId: string): Promise<Site> {
        // Normalize email (optional)
        const normalizedEmail = createSiteDto.email?.trim() ? createSiteDto.email.toLowerCase().trim() : null;
        const normalizedSitePhone = createSiteDto.contactNumber?.trim()
            ? this.phoneValidationService.getLocalPhone(createSiteDto.contactNumber.trim())
            : '';

        // Fetch selected parent company when provided (for allow-same-email/phone rule)
        let selectedParentCompany: ParentCompany | null = null;
        if (createSiteDto.parentCompanyId) {
            selectedParentCompany = await this.parentCompanyRepository.findOne({
                where: { id: createSiteDto.parentCompanyId }
            });
            if (!selectedParentCompany) {
                throw new BadRequestException('Parent company not found');
            }
        }

        // Only the selected parent company's email/phone may be reused; all other duplicates are rejected
        if (normalizedEmail) {
            const parentEmail = selectedParentCompany?.email?.toLowerCase().trim() || null;
            const matchesSelectedParent = selectedParentCompany && parentEmail === normalizedEmail;
            if (!matchesSelectedParent) {
                await this.emailValidationService.validateEmailUniqueness(normalizedEmail);
            }
        }

        if (normalizedSitePhone) {
            const parentPhone = selectedParentCompany?.contactNumber
                ? this.phoneValidationService.getLocalPhone(selectedParentCompany.contactNumber)
                : '';
            const matchesSelectedParent = selectedParentCompany && parentPhone === normalizedSitePhone;
            if (!matchesSelectedParent) {
                await this.phoneValidationService.validatePhoneUniqueness(createSiteDto.contactNumber!.trim());
            }
        }

        // Validate user
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new BadRequestException('User not found');
        }

        // Validate dealer if provided
        if (createSiteDto.assignedDealerId) {
            const dealer = await this.dealerRepository.findOne({
                where: { id: createSiteDto.assignedDealerId }
            });
            if (!dealer) {
                throw new BadRequestException('Dealer not found');
            }
        }

        try {
            const site = this.siteRepository.create({
                siteName: createSiteDto.siteName,
                parentCompanyId: createSiteDto.parentCompanyId ?? null,
                assignedDealerId: createSiteDto.assignedDealerId ?? null,
                businessAddress: createSiteDto.businessAddress,
                state: createSiteDto.state,
                stateCode: createSiteDto.stateCode,
                city: createSiteDto.city,
                description: createSiteDto.description,
                email: normalizedEmail ?? null,
                contactNumber: normalizedSitePhone || null,
                userId,
            } as DeepPartial<Site>);

            const saved = await this.siteRepository.save(site);
            this.auditFileLogger.logSite({
                action: 'CREATE',
                userId,
                entityId: saved.id,
                after: saved,
            });
            return saved;
        } catch (error) {
            // If it's already a ConflictException from email validation, re-throw it
            if (error instanceof ConflictException) {
                throw error;
            }
            
            // Handle database errors
            if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') {
                throw new BadRequestException('Site with this Email already exists');
            }
            throw error;
        }
    }

    async findAll(userId: string): Promise<Site[]> {
        return await this.siteRepository.find({
            where: { userId },
            relations: ['parentCompany', 'assignedDealer'],
            order: { createdAt: 'DESC' }
        });
    }

    async findById(id: string, userId: string): Promise<Site> {
        const site = await this.siteRepository.findOne({
            where: { id, userId },
            relations: ['parentCompany', 'assignedDealer']
        });

        if (!site) {
            throw new NotFoundException('Site not found');
        }

        return site;
    }

    async findByName(siteName: string, userId?: string): Promise<SiteByNameResponse[]> {
        if (!siteName || typeof siteName !== 'string' || !siteName.trim()) {
            throw new BadRequestException('Site name is required');
        }
        const name = siteName.trim();
        const normalizedName = this.normalizeSiteName(name);
        const normalizedPhone = this.normalizeLookupPhone(name);
        const trimmedNormalizedPhone = this.trimLeadingZero(normalizedPhone);
        // Country code digits (e.g. "61"); guarded to digits only for safe SQL interpolation.
        const lookupCountryCode = (
            this.phoneValidationService.getCountryCodeNumber() || ''
        ).replace(/[^0-9]/g, '');
        const qb = this.siteRepository
            .createQueryBuilder('site')
            .leftJoinAndSelect('site.assignedDealer', 'assignedDealer')
            .where(new Brackets((subQb) => {
                subQb.where(
                    `LOWER(REGEXP_REPLACE(site.siteName, '[^a-zA-Z0-9]', '', 'g')) = :normalizedName`,
                    { normalizedName }
                );

                if (normalizedPhone) {
                    subQb.orWhere(
                        `REGEXP_REPLACE(COALESCE(site.contactNumber, ''), '[^0-9]', '', 'g') = :normalizedPhone`,
                        { normalizedPhone }
                    );

                    if (trimmedNormalizedPhone && trimmedNormalizedPhone !== normalizedPhone) {
                        subQb.orWhere(
                            `REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(site.contactNumber, ''), '[^0-9]', '', 'g'), '^0+', '', 'g') = :trimmedNormalizedPhone`,
                            { trimmedNormalizedPhone }
                        );
                    }

                    // Country-code-tolerant match: strip an optional leading country code and
                    // any trunk zeros from the STORED number, then compare to the input's local
                    // form. Handles e.g. "+610398457000" / "+61398457000" / "0398457000".
                    const localTail = trimmedNormalizedPhone || normalizedPhone;
                    if (localTail && lookupCountryCode) {
                        subQb.orWhere(
                            `REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(site.contactNumber, ''), '[^0-9]', '', 'g'), '^${lookupCountryCode}', '', 'g'), '^0+', '', 'g') = :localTail`,
                            { localTail }
                        );
                    }

                    // Area-code-omitted match: the caller may say only the local part
                    // (e.g. "9845 7000") while the stored number keeps the area code
                    // ("03 9845 7000"). Match when the stored digits END WITH the
                    // caller's digits. Guarded to 7+ digits so short fragments like
                    // "8000" can't suffix-match every site (false positives).
                    if (normalizedPhone.length >= 7) {
                        subQb.orWhere(
                            `REGEXP_REPLACE(COALESCE(site.contactNumber, ''), '[^0-9]', '', 'g') LIKE :phoneSuffix`,
                            { phoneSuffix: `%${normalizedPhone}` }
                        );
                    }
                }
            }));
        if (userId) {
            qb.andWhere('site.userId = :userId', { userId });
        }
        const sites = await qb.getMany();

        if (!sites.length) {
            throw new NotFoundException(`Site with name or phone "${name}" not found`);
        }

        const response = sites.map((site) => {
            const d = site.assignedDealer;
            return {
                id: site.id,
                siteName: site.siteName,
                email: site.email,
                contactNumber: site.contactNumber,
                assignedDealer: d
                    ? {
                          dealerCode: d.dealerCode,
                          dealerName: d.dealerName,
                          phone: d.phone,
                          email: d.email,
                      }
                    : null,
            };
        });

        this.auditFileLogger.logApiGetBySiteName({
            action: 'API_CALL',
            request: { siteName: name, userId: userId ?? null },
            response,
        });

        return response;
    }

    async update(id: string, updateSiteDto: UpdateSiteDto, userId: string): Promise<Site> {
        const site = await this.findById(id, userId);
        const before = { ...site };

        const effectiveParentCompanyId = updateSiteDto.parentCompanyId ?? site.parentCompanyId ?? null;
        let selectedParentCompany: ParentCompany | null = null;
        if (effectiveParentCompanyId) {
            selectedParentCompany = await this.parentCompanyRepository.findOne({
                where: { id: effectiveParentCompanyId }
            });
            if (updateSiteDto.parentCompanyId && !selectedParentCompany) {
                throw new BadRequestException('Parent company not found');
            }
        }

        // Only the selected parent company's email/phone may be reused.
        // For email:
        //  - If another Site already uses this email (different id), report "already registered as a Site".
        //  - Otherwise, run a cross-entity uniqueness check (Dealer / Parent / Agent) and use the
        //    specific entity message from EmailValidationService (e.g. "... as a Parent Company").
        // For phone:
        //  - Only the selected parent company's phone may be reused; everything else is rejected.
        const normalizedEmail = updateSiteDto.email !== undefined && updateSiteDto.email?.trim()
            ? updateSiteDto.email.toLowerCase().trim()
            : null;
        const currentEmail = site.email?.toLowerCase().trim() || null;
        const parentEmail = selectedParentCompany?.email?.toLowerCase().trim() || null;
        const matchesParentEmail = selectedParentCompany && parentEmail === normalizedEmail;
        const emailNeedsValidation = updateSiteDto.email !== undefined && normalizedEmail !== currentEmail && !!normalizedEmail && !matchesParentEmail;

        const contactStr =
            updateSiteDto.contactNumber !== undefined
                ? typeof updateSiteDto.contactNumber === 'string'
                    ? updateSiteDto.contactNumber
                    : String(updateSiteDto.contactNumber ?? '')
                : (site.contactNumber ?? '');
        const effectiveLocalPhone = this.phoneValidationService.getLocalPhone(contactStr);
        const parentPhone = selectedParentCompany?.contactNumber
            ? this.phoneValidationService.getLocalPhone(selectedParentCompany.contactNumber)
            : '';
        const matchesParentPhone = selectedParentCompany && parentPhone === effectiveLocalPhone;
        const phoneNeedsValidation = !!effectiveLocalPhone && !matchesParentPhone;

        const validationErrors: { email?: string; contactNumber?: string } = {};

        if (emailNeedsValidation || phoneNeedsValidation) {
            const runEmailValidation = async () => {
                if (!emailNeedsValidation) return;

                // First, check within Site table so we can give a clear Site-specific message.
                const existingSiteWithEmail = await this.siteRepository.findOne({
                    where: { email: normalizedEmail! },
                });
                if (existingSiteWithEmail && existingSiteWithEmail.id !== id) {
                    throw new ConflictException('This Email is already registered as a Site');
                }

                // Then, run cross-entity uniqueness (Dealer / Parent / Agent), excluding Site
                // so the EmailValidationService can return a specific entity message when relevant.
                await this.emailValidationService.validateEmailUniqueness(
                    normalizedEmail!,
                    EmailEntityType.SITE,
                    id,
                );
            };
            const runPhoneValidation = async () => {
                if (!phoneNeedsValidation) return;
                const allSites = await this.siteRepository.find({ select: ['id', 'contactNumber'] });
                const duplicateSite = allSites.find(
                    (s) => s.id !== id && this.phoneValidationService.getLocalPhone(s.contactNumber ?? '') === effectiveLocalPhone,
                );
                if (duplicateSite) throw new ConflictException('This phone number is already registered as a Site');
                await this.phoneValidationService.validatePhoneUniqueness(contactStr, PhoneEntityType.SITE, id);
            };

            const [emailResult, phoneResult] = await Promise.allSettled([runEmailValidation(), runPhoneValidation()]);

            if (emailResult.status === 'rejected') {
                const msg = (emailResult.reason as any)?.response?.message || (emailResult.reason as Error)?.message;
                validationErrors.email = typeof msg === 'string' ? msg : 'This email is already registered.';
            }
            if (phoneResult.status === 'rejected') {
                const msg = (phoneResult.reason as any)?.response?.message || (phoneResult.reason as Error)?.message;
                validationErrors.contactNumber = typeof msg === 'string' ? msg : 'This phone number is already registered.';
            }

            if (Object.keys(validationErrors).length > 0) {
                throw new ConflictException({
                    message: 'Validation failed',
                    errors: validationErrors,
                });
            }
        }

        if (updateSiteDto.email !== undefined) {
            (updateSiteDto as { email?: string | null }).email = normalizedEmail;
        }
        if (updateSiteDto.contactNumber !== undefined) {
            const localUpdate = this.phoneValidationService.getLocalPhone(
                typeof updateSiteDto.contactNumber === 'string'
                    ? updateSiteDto.contactNumber
                    : String(updateSiteDto.contactNumber ?? ''),
            );
            const localCurrent = this.phoneValidationService.getLocalPhone(site.contactNumber || '');
            if (localUpdate !== localCurrent) {
                (updateSiteDto as { contactNumber?: string | null }).contactNumber = localUpdate || null;
            }
        }

        // Validate dealer if being updated
        if (updateSiteDto.assignedDealerId) {
            const dealer = await this.dealerRepository.findOne({
                where: { id: updateSiteDto.assignedDealerId }
            });
            if (!dealer) {
                throw new BadRequestException('Dealer not found');
            }
        }

        try {
            // Build a scalar-only patch. We must NOT go through repository.save() with the
            // loaded relation objects present: TypeORM lets the relation property win over the
            // FK column, so it would write parentCompanyId/assignedDealerId back to null.
            // repository.update() writes columns directly and never touches relations.
            const {
                parentCompanyId: dtoParentId,
                assignedDealerId: dtoDealerId,
                ...scalarUpdate
            } = updateSiteDto;

            const patch: Record<string, unknown> = { ...scalarUpdate };
            // Only change a relation FK when a real (non-empty) value is provided, so an
            // empty or omitted field never wipes an existing link.
            if (typeof dtoParentId === 'string' && dtoParentId) {
                patch.parentCompanyId = dtoParentId;
            }
            if (typeof dtoDealerId === 'string' && dtoDealerId) {
                patch.assignedDealerId = dtoDealerId;
            }

            await this.siteRepository.update({ id }, patch as DeepPartial<Site>);

            const saved = await this.findById(id, userId);
            this.auditFileLogger.logSite({
                action: 'UPDATE',
                userId,
                entityId: id,
                before,
                after: saved,
            });
            return saved;
        } catch (error) {
            // If it's already a ConflictException from email validation, re-throw it
            if (error instanceof ConflictException) {
                throw error;
            }
            
            if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') {
                throw new BadRequestException('Site with this Email already exists');
            }
            throw error;
        }
    }

    async delete(id: string, userId: string): Promise<void> {
        const site = await this.findById(id, userId);
        const before = { ...site };
        await this.siteRepository.remove(site);
        this.auditFileLogger.logSite({
            action: 'DELETE',
            userId,
            entityId: id,
            before,
        });
    }
}