export interface IUser {
  id: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: 'customer' | 'admin';
  createdAt: Date;
}

export interface ISignUpRequest {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role?: string;
}

export interface ISignInRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface IUserResponse {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  createdAt: Date;
}

export interface IAuthResponse {
  user: IUserResponse;
  token: string;
  expiresIn: number;
  message: string;
}

export interface IAuthenticatedRequest {
  user: {
    sub: string;
    email: string;
    role: string;
  };
}
