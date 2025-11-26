export interface LoginDto {
  email: string;
  password: string;
}

export interface ApiResponse<T> {
  code: string;
  message: string;
  data: T;
}

export interface TokenResponseDto {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  fullName: string;
  roles: string[];
  expiresAt: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string;
  roles: string[];
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: (googleToken: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}