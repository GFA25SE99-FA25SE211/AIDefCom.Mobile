import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LoginDto, ApiResponse, TokenResponseDto } from "../types/auth";
import { API_CONFIG, STORAGE_KEYS } from "../utils/constants";
import { DefenseSession } from "../types/defense";

const apiClient = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor để thêm token
apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor để handle refresh token
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Log error để debug
    console.error('API Error:', {
      message: error.message,
      url: error.config?.url,
      baseURL: error.config?.baseURL,
      status: error.response?.status,
      data: error.response?.data,
    });

    if (error.response?.status === 401) {
      // Token expired, try to refresh
      const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      const userId = await AsyncStorage.getItem(STORAGE_KEYS.USER_ID);
      
      if (refreshToken && userId) {
        try {
          const refreshResponse = await axios.post(`${API_CONFIG.BASE_URL}/auth/refresh-token`, {
            userId,
            refreshToken,
          });
          
          if (refreshResponse.data?.data) {
            const newTokenData = refreshResponse.data.data;
            await AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, newTokenData.accessToken);
            await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, newTokenData.refreshToken);
            
            // Retry original request with new token
            error.config.headers.Authorization = `Bearer ${newTokenData.accessToken}`;
            return apiClient.request(error.config);
          }
        } catch (refreshError) {
          // Refresh failed, logout user
          await AsyncStorage.multiRemove([
            STORAGE_KEYS.ACCESS_TOKEN, 
            STORAGE_KEYS.REFRESH_TOKEN, 
            STORAGE_KEYS.USER_ID, 
            STORAGE_KEYS.USER_DATA
          ]);
        }
      }
    }
    return Promise.reject(error);
  }
);

// Helper function to decode JWT token
const decodeJWT = (token: string): any => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null;
  }
};

const buildTokenData = (apiData: any, fallbackEmail: string): TokenResponseDto => {
  if (!apiData || !apiData.accessToken) {
    throw new Error("Invalid response format from API");
  }

  const accessToken = apiData.accessToken;
  const decodedToken = decodeJWT(accessToken);
  console.log("Decoded JWT:", JSON.stringify(decodedToken, null, 2));

  if (!decodedToken) {
    throw new Error("Failed to decode JWT token");
  }

  const emailFromApi =
    apiData.email ||
    apiData.userEmail ||
    apiData.user?.email;

  const fullNameFromApi =
    apiData.fullName ||
    apiData.userFullName ||
    apiData.user?.fullName;

  const email =
    decodedToken["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"] ||
    decodedToken.email ||
    emailFromApi ||
    fallbackEmail;
  const userId =
    decodedToken["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] ||
    decodedToken.sub ||
    decodedToken.userId;
  const fullName =
    fullNameFromApi ||
    decodedToken["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"] ||
    decodedToken.name ||
    email.split("@")[0];
  const role =
    decodedToken["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] ||
    decodedToken.role;
  const roles = role ? [role] : [];
  const expiresAt = decodedToken.exp ? new Date(decodedToken.exp * 1000).toISOString() : "";

  const tokenData: TokenResponseDto = {
    accessToken: apiData.accessToken,
    refreshToken: apiData.refreshToken,
    userId: userId || "",
    email: email || fallbackEmail,
    fullName: fullName || email.split("@")[0],
    roles,
    expiresAt,
  };

  console.log("Token data built:", JSON.stringify(tokenData, null, 2));
  return tokenData;
};

export const authService = {
  async login(loginData: LoginDto): Promise<TokenResponseDto> {
    const response = await apiClient.post<ApiResponse<any>>(
      "/auth/login",
      loginData
    );
    console.log("Login API Response:", JSON.stringify(response.data, null, 2));
    console.log("Login API Data:", JSON.stringify(response.data.data, null, 2));

    let tokenData = buildTokenData(response.data.data, loginData.email);

    // Fetch full user profile to get real fullName, roles, etc.
    try {
      const profileResp = await axios.get<ApiResponse<any>>(
        `${API_CONFIG.BASE_URL}/auth/users/${tokenData.userId}`,
        {
          headers: {
            Authorization: `Bearer ${tokenData.accessToken}`,
          },
        }
      );

      const profile = profileResp.data?.data;
      if (profile) {
        tokenData = {
          ...tokenData,
          email: profile.email || tokenData.email,
          fullName: profile.fullName || tokenData.fullName,
          roles: Array.isArray(profile.roles) && profile.roles.length
            ? profile.roles
            : tokenData.roles,
        };
        console.log(
          "User profile merged into token data:",
          JSON.stringify(tokenData, null, 2)
        );
      }
    } catch (profileError) {
      console.error("Failed to fetch user profile after login:", profileError);
    }

    return tokenData;
  },

  async loginWithGoogle(googleToken: string): Promise<TokenResponseDto> {
    const response = await apiClient.post<ApiResponse<any>>(
      "/auth/login/google",
      {
        token: googleToken,
      }
    );
    console.log(
      "Google Login API Response:",
      JSON.stringify(response.data, null, 2)
    );

    let tokenData = buildTokenData(response.data.data, "");

    // Fetch full user profile after Google login as well
    try {
      const profileResp = await axios.get<ApiResponse<any>>(
        `${API_CONFIG.BASE_URL}/auth/users/${tokenData.userId}`,
        {
          headers: {
            Authorization: `Bearer ${tokenData.accessToken}`,
          },
        }
      );

      const profile = profileResp.data?.data;
      if (profile) {
        tokenData = {
          ...tokenData,
          email: profile.email || tokenData.email,
          fullName: profile.fullName || tokenData.fullName,
          roles: Array.isArray(profile.roles) && profile.roles.length
            ? profile.roles
            : tokenData.roles,
        };
        console.log(
          "User profile merged into token data (Google):",
          JSON.stringify(tokenData, null, 2)
        );
      }
    } catch (profileError) {
      console.error(
        "Failed to fetch user profile after Google login:",
        profileError
      );
    }

    return tokenData;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      // Even if logout API fails, clear local storage
      console.log('Logout API failed, but clearing local storage');
    } finally {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.ACCESS_TOKEN, 
        STORAGE_KEYS.REFRESH_TOKEN, 
        STORAGE_KEYS.USER_ID, 
        STORAGE_KEYS.USER_DATA
      ]);
    }
  },
};

export const defenseSessionService = {
  async getAll(): Promise<DefenseSession[]> {
    const response = await apiClient.get<ApiResponse<DefenseSession[]>>(
      "/defense-sessions"
    );
    return response.data.data || [];
  },
  async getByLecturerId(lecturerId: string): Promise<DefenseSession[]> {
    const response = await apiClient.get<ApiResponse<DefenseSession[]>>(
      `/defense-sessions/lecturer/${lecturerId}`
    );
    return response.data.data || [];
  },
};

export default apiClient;