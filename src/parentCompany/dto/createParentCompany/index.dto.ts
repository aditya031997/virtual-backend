import { IsString, IsEmail, IsNotEmpty, MaxLength, IsOptional, ValidateIf } from 'class-validator';

export class CreateParentCompanyDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    companyName: string;

    @IsOptional()
    @ValidateIf((o) => o.email != null && o.email !== '')
    @IsEmail()
    @MaxLength(255)
    email?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    contactNumber?: string;

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