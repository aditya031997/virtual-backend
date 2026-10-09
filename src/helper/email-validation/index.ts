import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dealer, HumanAgent, ParentCompany, Site } from '@/schema';

export enum EmailEntityType {
  DEALER = 'dealer',
  HUMAN_AGENT = 'human_agent',
  PARENT_COMPANY = 'parent_company',
  SITE = 'site',
}

@Injectable()
export class EmailValidationService {
  constructor(
    @InjectRepository(Dealer)
    private readonly dealerRepository: Repository<Dealer>,
    @InjectRepository(HumanAgent)
    private readonly humanAgentRepository: Repository<HumanAgent>,
    @InjectRepository(ParentCompany)
    private readonly parentCompanyRepository: Repository<ParentCompany>,
    @InjectRepository(Site)
    private readonly siteRepository: Repository<Site>,
  ) {}

  /**
   * Check if email exists in any of the 4 tables (Dealer, HumanAgent, ParentCompany, Site)
   * @param email - Email to check (will be normalized to lowercase)
   * @param excludeEntityType - Optional entity type to exclude from check (useful for updates)
   * @param excludeId - Optional ID to exclude from check (useful for updates)
   * @returns Object with found status and entity type where email exists
   */
  async checkEmailExists(
    email: string,
    excludeEntityType?: EmailEntityType,
    excludeId?: string,
  ): Promise<{ exists: boolean; entityType?: EmailEntityType; message?: string }> {
    if (!email || !email.trim()) {
      return { exists: false };
    }

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim();

    // Check Dealer
    if (excludeEntityType !== EmailEntityType.DEALER) {
      const dealer = await this.dealerRepository.findOne({
        where: { email: normalizedEmail },
      });
      if (dealer) {
        if (!excludeId || dealer.id !== excludeId) {
          return {
            exists: true,
            entityType: EmailEntityType.DEALER,
            message: 'This Email is already registered as a Dealer',
          };
        }
      }
    }

    // Check HumanAgent
    if (excludeEntityType !== EmailEntityType.HUMAN_AGENT) {
      const humanAgent = await this.humanAgentRepository.findOne({
        where: { email: normalizedEmail },
      });
      if (humanAgent) {
        if (!excludeId || humanAgent.id !== excludeId) {
          return {
            exists: true,
            entityType: EmailEntityType.HUMAN_AGENT,
            message: 'This Email is already registered as a Human Agent',
          };
        }
      }
    }

    // Check ParentCompany
    if (excludeEntityType !== EmailEntityType.PARENT_COMPANY) {
      const parentCompany = await this.parentCompanyRepository.findOne({
        where: { email: normalizedEmail },
      });
      if (parentCompany) {
        if (!excludeId || parentCompany.id !== excludeId) {
          return {
            exists: true,
            entityType: EmailEntityType.PARENT_COMPANY,
            message: 'This Email is already registered as a Parent Company',
          };
        }
      }
    }

    // Check Site
    if (excludeEntityType !== EmailEntityType.SITE) {
      const site = await this.siteRepository.findOne({
        where: { email: normalizedEmail },
      });
      if (site) {
        if (!excludeId || site.id !== excludeId) {
          return {
            exists: true,
            entityType: EmailEntityType.SITE,
            message: 'This Email is already registered as a Site',
          };
        }
      }
    }

    return { exists: false };
  }

  /**
   * Validate email and throw ConflictException if email exists
   * @param email - Email to validate
   * @param excludeEntityType - Optional entity type to exclude from check (useful for updates)
   * @param excludeId - Optional ID to exclude from check (useful for updates)
   * @throws ConflictException if email already exists
   */
  async validateEmailUniqueness(
    email: string,
    excludeEntityType?: EmailEntityType,
    excludeId?: string,
  ): Promise<void> {
    const result = await this.checkEmailExists(email, excludeEntityType, excludeId);
    
    if (result.exists) {
      throw new ConflictException(
        result.message || 'This Email is already registered in the system. Please use a different Email address.',
      );
    }
  }

  /**
   * Validate email uniqueness only within the given entity type (e.g. same email can be used for Parent Company and Site).
   * @param email - Email to validate
   * @param entityType - Only check this entity type's table
   * @param excludeId - Optional ID to exclude (for updates)
   */
  async validateEmailUniquenessForEntity(
    email: string,
    entityType: EmailEntityType,
    excludeId?: string,
  ): Promise<void> {
    if (!email || !email.trim()) return;
    const normalizedEmail = email.toLowerCase().trim();

    if (entityType === EmailEntityType.PARENT_COMPANY) {
      const qb = this.parentCompanyRepository
        .createQueryBuilder('pc')
        .where('LOWER(TRIM(pc.email)) = :email', { email: normalizedEmail });
      if (excludeId) {
        qb.andWhere('pc.id != :excludeId', { excludeId });
      }
      const existing = await qb.getOne();
      if (existing) {
        throw new ConflictException('This Email is already registered as a Parent Company');
      }
    } else if (entityType === EmailEntityType.SITE) {
      const existing = await this.siteRepository.findOne({ where: { email: normalizedEmail } });
      if (existing && existing.id !== excludeId) {
        throw new ConflictException('This Email is already registered as a Site');
      }
    } else if (entityType === EmailEntityType.DEALER) {
      const existing = await this.dealerRepository.findOne({ where: { email: normalizedEmail } });
      if (existing && existing.id !== excludeId) {
        throw new ConflictException('This Email is already registered as a Dealer');
      }
    } else if (entityType === EmailEntityType.HUMAN_AGENT) {
      const existing = await this.humanAgentRepository.findOne({ where: { email: normalizedEmail } });
      if (existing && existing.id !== excludeId) {
        throw new ConflictException('This Email is already registered as a Human Agent');
      }
    }
  }
}


