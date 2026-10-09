import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@/schema/user/user.entity';
import { Role } from '@/schema/user/role.entity';
import { ISignUpRequest, ISignInRequest, IUserResponse, IAuthResponse } from '@/types';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
  ) { }
  async signUp(signUpData: ISignUpRequest): Promise<IUserResponse> {
    const normalizedEmail = signUpData.email.toLowerCase().trim();
    const existingUser = await this.userRepository.findOne({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }
    const roleName = signUpData.role || 'customer';
    let role = await this.roleRepository.findOne({
      where: { name: roleName }
    });

    if (!role) {
      try {
        const newRole = this.roleRepository.create({
          name: roleName
        });
        role = await this.roleRepository.save(newRole);
        console.log(`Created new role: ${roleName}`);
      } catch (error) {
        if (error.code === '23505' || error.message.includes('duplicate key')) {
          role = await this.roleRepository.findOne({
            where: { name: roleName }
          });

          if (!role) {
            throw new Error(`Failed to create or find role '${roleName}'`);
          }
        } else {
          throw new Error(`Failed to create role '${roleName}': ${error.message}`);
        }
      }
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(signUpData.password, saltRounds);

    // Create new user with normalized email
    const newUser = this.userRepository.create({
      name: signUpData.name,
      email: normalizedEmail, // Store normalized email
      password: hashedPassword,
      role: role,
    });

    const savedUser = await this.userRepository.save(newUser);

    // Fetch user with role for response
    const userWithRole = await this.userRepository.findOne({
      where: { id: savedUser.id },
      relations: ['role']
    });

    return this.mapToUserResponse(userWithRole!);
  }

async signIn(signInData: ISignInRequest): Promise<IAuthResponse> {
  const normalizedEmail = signInData.email.toLowerCase().trim();
  
  // Check if user exists
  const user = await this.userRepository.findOne({
    where: { email: normalizedEmail },
    relations: ['role']
  });

  if (!user) {
    throw new UnauthorizedException('No account found with this email address. Please check your email and try again.');
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(signInData.password, user.password);
  if (!isPasswordValid) {
    throw new UnauthorizedException('Incorrect password. Please check your password and try again.');
  }

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role.name
  };

  const expiresIn = signInData.rememberMe ? '30d' : '24h';
  const expiresInSeconds = signInData.rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60;

  const token = await this.jwtService.signAsync(payload, {
    secret: process.env.JWT_SECRET,
    expiresIn
  });

  return {
    user: this.mapToUserResponse(user),
    token,
    expiresIn: expiresInSeconds,
    message: 'Sign in successful'
  };
}

  async getUserDetails(userId: string): Promise<IUserResponse> {
    const user = await this.userRepository.findOne({
      where: { id: userId }
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.mapToUserResponse(user);
  }

  private mapToUserResponse(user: User): IUserResponse {
    const { password, role, ...userResponse } = user;
    return {
      ...userResponse,
      role: role?.name || 'customer',
    }
  }
}
