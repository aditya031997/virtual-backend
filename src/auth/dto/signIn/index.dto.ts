import { IsString, IsEmail, IsOptional, IsBoolean } from 'class-validator';
import { ISignInRequest } from '@/types';

export class SignInDto implements ISignInRequest {

  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsString()
  password: string;
  @IsOptional()     
  @IsBoolean()     
  rememberMe?: boolean;
}
