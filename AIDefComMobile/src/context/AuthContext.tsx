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
      throw new Error("Invalid response data - missing roles");
    }

    if (tokenData.roles.length === 0) {
      throw new Error("Account does not have access permission");
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

    let errorMessage = "An error occurred during login";
    if (
      error.code === "ECONNREFUSED" ||
      error.message?.includes("Network Error")
    ) {
      errorMessage =
        "Cannot connect to server. Check your network connection and ensure the API is running.";
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
        errorMessage = "Invalid email or password";
      } else {
        errorMessage = details || "Invalid email or password";
      }
    } else if (error.response?.status === 404) {
      errorMessage =
        "API not found. Check the URL and ensure the API is running.";
    } else if (error.response?.data?.details) {
      errorMessage = error.response.data.details;
    } else if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    }

    Toast.show({
      type: "error",
      text1: "Login error",
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
          text1: "Access denied",
          text2:
            roleError?.message ||
            "Account does not have valid access permission.",
        });
        return false;
      }
      await persistAuthData(tokenData);

      Toast.show({
        type: "success",
        text1: tokenData.fullName || "Login successful",
        text2: "Login successful",
      });

      return true;
    } catch (error: any) {
      console.error("Login error:", error);
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
          text1: "Access denied",
          text2:
            roleError?.message ||
            "Account does not have valid access permission.",
        });
        return false;
      }
      await persistAuthData(tokenData);

      Toast.show({
        type: "success",
        text1: tokenData.fullName || "Login successful",
        text2: "Login successful",
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
        text1: "Logout successful",
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
