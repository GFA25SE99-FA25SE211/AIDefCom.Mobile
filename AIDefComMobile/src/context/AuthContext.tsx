import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthContextType, User } from "../types/auth";
import { authService } from "../services/api";
import { STORAGE_KEYS, USER_ROLES } from "../utils/constants";
import Toast from "react-native-toast-message";
import { TokenResponseDto } from "../types/auth";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Check if user is already logged in when app starts
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
        STORAGE_KEYS.USER_ID,
        STORAGE_KEYS.USER_DATA,
      ]);

      setUser(null);
      setToken(null);
    } catch (error) {
      console.error("Error checking auth status:", error);
    } finally {
      setIsLoading(false as boolean);
    }
  };

  const persistAuthData = async (tokenData: TokenResponseDto) => {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.ACCESS_TOKEN, tokenData.accessToken],
      [STORAGE_KEYS.REFRESH_TOKEN, tokenData.refreshToken],
      [STORAGE_KEYS.USER_ID, tokenData.userId],
      [
        STORAGE_KEYS.USER_DATA,
        JSON.stringify({
          id: tokenData.userId,
          email: tokenData.email,
          fullName: tokenData.fullName,
          phoneNumber: "",
          roles: tokenData.roles,
        }),
      ],
    ]);

    setToken(tokenData.accessToken);
    setUser({
      id: tokenData.userId,
      email: tokenData.email,
      fullName: tokenData.fullName,
      phoneNumber: "",
      roles: tokenData.roles,
    });
  };

  const ensureValidRoles = (tokenData: TokenResponseDto) => {
    if (!tokenData.roles || !Array.isArray(tokenData.roles)) {
      throw new Error("Dữ liệu phản hồi không hợp lệ - thiếu roles");
    }

    if (!tokenData.roles.includes(USER_ROLES.STUDENT)) {
      throw new Error("Tài khoản này không có quyền sinh viên");
    }
  };

  const handleAuthError = (error: any) => {
    console.error("Login error:", error);
    console.error("Error details:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      code: error.code,
    });

    let errorMessage = "Đã có lỗi xảy ra khi đăng nhập";
    if (
      error.code === "ECONNREFUSED" ||
      error.message?.includes("Network Error")
    ) {
      errorMessage =
        "Không thể kết nối đến server. Kiểm tra lại kết nối mạng và đảm bảo API đang chạy.";
    } else if (
      error.response?.status === 401 ||
      error.response?.status === 500
    ) {
      const details =
        error.response?.data?.details || error.response?.data?.message;
      if (
        details?.includes("Invalid email or password") ||
        details?.includes("email") ||
        details?.includes("password")
      ) {
        errorMessage = "Email hoặc mật khẩu không đúng";
      } else {
        errorMessage = details || "Email hoặc mật khẩu không đúng";
      }
    } else if (error.response?.status === 404) {
      errorMessage =
        "Không tìm thấy API. Kiểm tra lại URL và đảm bảo API đang chạy.";
    } else if (error.response?.data?.details) {
      errorMessage = error.response.data.details;
    } else if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    }

    Toast.show({
      type: "error",
      text1: "Lỗi đăng nhập",
      text2: errorMessage,
    });
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true as boolean);
      console.log("Attempting login with:", { email, password: "***" });
      const tokenData = await authService.login({ email, password });
      console.log("Token data received:", JSON.stringify(tokenData, null, 2));

      try {
        ensureValidRoles(tokenData);
      } catch (roleError: any) {
        console.error("Role validation error:", roleError);
        Toast.show({
          type: "error",
          text1: "Không có quyền truy cập",
          text2:
            roleError?.message ||
            "Tài khoản này không có quyền sinh viên. Vui lòng dùng tài khoản sinh viên.",
        });
        return false;
      }
      await persistAuthData(tokenData);

      Toast.show({
        type: "success",
        text1: tokenData.fullName || "Đăng nhập thành công",
        text2: "Đăng nhập thành công",
      });

      return true;
    } catch (error: any) {
      console.error("Login error:", error);
      // Don't show toast here, let the calling component handle it
      return false;
    } finally {
      setIsLoading(false as boolean);
    }
  };

  const loginWithGoogle = async (googleToken: string): Promise<boolean> => {
    try {
      setIsLoading(true as boolean);
      const tokenData = await authService.loginWithGoogle(googleToken);
      try {
        ensureValidRoles(tokenData);
      } catch (roleError: any) {
        console.error("Role validation error (Google):", roleError);
        Toast.show({
          type: "error",
          text1: "Không có quyền truy cập",
          text2:
            roleError?.message ||
            "Tài khoản này không có quyền sinh viên. Vui lòng dùng tài khoản sinh viên.",
        });
        return false;
      }
      await persistAuthData(tokenData);

      Toast.show({
        type: "success",
        text1: tokenData.fullName || "Đăng nhập thành công",
        text2: "Đăng nhập thành công",
      });

      return true;
    } catch (error: any) {
      handleAuthError(error);
      return false;
    } finally {
      setIsLoading(false as boolean);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true as boolean);
      await authService.logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
      setToken(null);
      setIsLoading(false as boolean);

      Toast.show({
        type: "success",
        text1: "Đăng xuất thành công",
      });
    }
  };

  const value: AuthContextType = {
    user,
    token,
    login,
    loginWithGoogle,
    logout,
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
