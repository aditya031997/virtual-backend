import { IsString, IsEmail, IsOptional, MinLength } from 'class-validator';
import { ISignUpRequest } from '@/types';

export class SignUpDto implements ISignUpRequest {
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters long' })
  name: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  role?: string
}
