import { IsString, IsEmail, IsNotEmpty, MaxLength, IsOptional, IsUUID } from 'class-validator';

export class CreateSiteDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    siteName: string;

    @IsUUID()
    @IsOptional()
    parentCompanyId?: string;

    @IsUUID()
    @IsOptional()
    assignedDealerId?: string;

    @IsString()
    @IsNotEmpty()
    @IsEmail()
    @MaxLength(255)
    email: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    contactNumber: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    businessAddress: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    state?: string;

    @IsString()
    @IsOptional()
    @MaxLength(10)
    stateCode?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    city?: string;

    @IsString()
    @IsOptional()
    description?: string;
}