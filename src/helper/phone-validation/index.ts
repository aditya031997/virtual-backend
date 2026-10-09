import { Injectable, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dealer, HumanAgent, ParentCompany, Site } from '@/schema';

export enum PhoneEntityType {
  DEALER = 'dealer',
  HUMAN_AGENT = 'human_agent',
  PARENT_COMPANY = 'parent_company',
  SITE = 'site',
}

@Injectable()
export class PhoneValidationService {
  private readonly countryCodeNumber: string;
  private readonly localDigits: number;

  constructor(
    @InjectRepository(Dealer)
    private readonly dealerRepository: Repository<Dealer>,
    @InjectRepository(HumanAgent)
    private readonly humanAgentRepository: Repository<HumanAgent>,
    @InjectRepository(ParentCompany)
    private readonly parentCompanyRepository: Repository<ParentCompany>,
    @InjectRepository(Site)
    private readonly siteRepository: Repository<Site>,
    private readonly configService: ConfigService,
  ) {
    const countryCode = this.configService.get<string>('COUNTRY_CODE') || '+61';
    this.countryCodeNumber = countryCode.replace(/^\+/, '');
    this.localDigits = this.countryCodeNumber === '91' ? 10 : 9;
  }

  /**
   * Normalize phone number for comparison (remove spaces, dashes, parentheses, and + prefix)
   */
  private normalizePhone(phone: string): string {
    if (!phone) return '';
    return phone.replace(/[\s()-]/g, '').replace(/^\+/, '');
  }

  /**
   * Strip country code and return local number only (digits). Used so we store only local
   * numbers in DB for ParentCompany and Site; dialing adds country code at use time.
   */
  getLocalPhone(phone: string): string {
    if (!phone || !phone.trim()) return '';
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    if (
      this.countryCodeNumber &&
      digits.startsWith(this.countryCodeNumber) &&
      digits.length >= this.countryCodeNumber.length + this.localDigits
    ) {
      return digits.slice(this.countryCodeNumber.length);
    }
    return digits;
  }

  /** Same as getLocalPhone but private for use in comparisons. */
  private toLocalPhone(phone: string): string {
    return this.getLocalPhone(phone);
  }

  /** Country code digits (e.g. "61"), for callers that need to strip it in queries. */
  getCountryCodeNumber(): string {
    return this.countryCodeNumber;
  }

  /**
   * Check if phone number exists in any of the 4 tables (Dealer, HumanAgent, ParentCompany, Site)
   * @param phone - Phone number to check (will be normalized)
   * @param excludeEntityType - Optional entity type to exclude from check (useful for updates)
   * @param excludeId - Optional ID to exclude from check (useful for updates)
   * @returns Object with found status and entity type where phone exists
   */
  async checkPhoneExists(
    phone: string,
    excludeEntityType?: PhoneEntityType,
    excludeId?: string,
  ): Promise<{ exists: boolean; entityType?: PhoneEntityType; message?: string }> {
    if (!phone || !phone.trim()) {
      return { exists: false };
    }

    const normalizedPhone = this.normalizePhone(phone);

    // Check Dealer (uses 'phone' field)
    if (excludeEntityType !== PhoneEntityType.DEALER) {
      const dealers = await this.dealerRepository.find({
        select: ['id', 'phone'],
      });
      const dealer = dealers.find(d => this.normalizePhone(d.phone) === normalizedPhone);
      if (dealer) {
        if (!excludeId || dealer.id !== excludeId) {
          return {
            exists: true,
            entityType: PhoneEntityType.DEALER,
            message: 'This phone number is already registered as a Dealer',
          };
        }
      }
    }

    // Check HumanAgent (uses 'phone' field)
    if (excludeEntityType !== PhoneEntityType.HUMAN_AGENT) {
      const agents = await this.humanAgentRepository.find({
        select: ['id', 'phone'],
      });
      const agent = agents.find(a => this.normalizePhone(a.phone) === normalizedPhone);
      if (agent) {
        if (!excludeId || agent.id !== excludeId) {
          return {
            exists: true,
            entityType: PhoneEntityType.HUMAN_AGENT,
            message: 'This phone number is already registered as a Human Agent',
          };
        }
      }
    }

    // Check ParentCompany (uses 'contactNumber' field) — compare as local numbers
    if (excludeEntityType !== PhoneEntityType.PARENT_COMPANY) {
      const parentCompanies = await this.parentCompanyRepository.find({
        select: ['id', 'contactNumber'],
      });
      const localInput = this.toLocalPhone(phone);
      const parentCompany = parentCompanies.find(
        pc => this.toLocalPhone(pc.contactNumber ?? '') === localInput,
      );
      if (parentCompany) {
        if (!excludeId || parentCompany.id !== excludeId) {
          return {
            exists: true,
            entityType: PhoneEntityType.PARENT_COMPANY,
            message: 'This phone number is already registered as a Parent Company',
          };
        }
      }
    }

    // Check Site (uses 'contactNumber' field) — compare as local numbers
    if (excludeEntityType !== PhoneEntityType.SITE) {
      const sites = await this.siteRepository.find({
        select: ['id', 'contactNumber'],
      });
      const localInput = this.toLocalPhone(phone);
      const site = sites.find(s => this.toLocalPhone(s.contactNumber ?? '') === localInput);
      if (site) {
        if (!excludeId || site.id !== excludeId) {
          return {
            exists: true,
            entityType: PhoneEntityType.SITE,
            message: 'This phone number is already registered as a Site',
          };
        }
      }
    }

    return { exists: false };
  }

  /**
   * Validate phone number and throw ConflictException if phone exists
   * @param phone - Phone number to validate
   * @param excludeEntityType - Optional entity type to exclude from check (useful for updates)
   * @param excludeId - Optional ID to exclude from check (useful for updates)
   * @throws ConflictException if phone already exists
   */
  async validatePhoneUniqueness(
    phone: string,
    excludeEntityType?: PhoneEntityType,
    excludeId?: string,
  ): Promise<void> {
    const result = await this.checkPhoneExists(phone, excludeEntityType, excludeId);
    
    if (result.exists) {
      throw new ConflictException(
        result.message || 'This phone number is already registered in the system. Please use a different phone number.',
      );
    }
  }

  /**
   * Validate phone uniqueness only within the given entity type (e.g. same phone can be used for Parent Company and Site).
   */
  async validatePhoneUniquenessForEntity(
    phone: string,
    entityType: PhoneEntityType,
    excludeId?: string,
  ): Promise<void> {
    if (!phone || !phone.trim()) return;
    const normalizedPhone = this.normalizePhone(phone);
    const localPhone = this.toLocalPhone(phone);

    if (entityType === PhoneEntityType.PARENT_COMPANY) {
      const list = await this.parentCompanyRepository.find({ select: ['id', 'contactNumber'] });
      const existing = list.find(
        pc => this.toLocalPhone(pc.contactNumber ?? '') === localPhone,
      );
      if (existing && existing.id !== excludeId) {
        throw new ConflictException('This phone number is already registered as a Parent Company');
      }
    } else if (entityType === PhoneEntityType.SITE) {
      const list = await this.siteRepository.find({ select: ['id', 'contactNumber'] });
      const existing = list.find(
        s => this.toLocalPhone(s.contactNumber ?? '') === localPhone,
      );
      if (existing && existing.id !== excludeId) {
        throw new ConflictException('This phone number is already registered as a Site');
      }
    } else if (entityType === PhoneEntityType.DEALER) {
      const list = await this.dealerRepository.find({ select: ['id', 'phone'] });
      const existing = list.find(d => this.normalizePhone(d.phone) === normalizedPhone);
      if (existing && existing.id !== excludeId) {
        throw new ConflictException('This phone number is already registered as a Dealer');
      }
    } else if (entityType === PhoneEntityType.HUMAN_AGENT) {
      const list = await this.humanAgentRepository.find({ select: ['id', 'phone'] });
      const existing = list.find(a => this.normalizePhone(a.phone) === normalizedPhone);
      if (existing && existing.id !== excludeId) {
        throw new ConflictException('This phone number is already registered as a Human Agent');
      }
    }
  }
}

