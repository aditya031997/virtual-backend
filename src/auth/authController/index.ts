import { Controller, Post, Get, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from '@/auth/authService';
import { SignUpDto,UserResponseDto, SignInDto } from '@/auth';
import { AuthGuard } from '@/common/guards/auth.guard';
import { IAuthResponse } from '@/types';
import type { IAuthenticatedRequest } from '@/types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signUp(@Body() signUpDto: SignUpDto): Promise<UserResponseDto> {
    return this.authService.signUp(signUpDto);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  async signIn(@Body() signInDto: SignInDto): Promise<IAuthResponse> {
    return this.authService.signIn(signInDto);
  }

  @Get('profile')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async getUserDetails(@Request() req: IAuthenticatedRequest): Promise<UserResponseDto> {
    const userId = req.user.sub;
    return this.authService.getUserDetails(userId);
  }
}
