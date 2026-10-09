import { IUserResponse } from '@/types';

export class UserResponseDto implements IUserResponse {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  createdAt: Date;
}
