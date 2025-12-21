import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { MaterialIcons, AntDesign } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import type { GoogleAuthRequestConfig } from "expo-auth-session/providers/google";
import { LinearGradient } from "expo-linear-gradient";
import Toast from "react-native-toast-message";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { colors, globalStyles } from "../utils/styles";
import { Loading } from "../components/Loading";
import { googleOAuthConfig, hasGoogleOAuthConfig } from "../config/google";
import Constants from "expo-constants";
import { RootStackParamList } from "../navigation/AppNavigator";
import { navigateByEnrollmentStatus } from "../utils/voiceNavigation";

WebBrowser.maybeCompleteAuthSession();

export const LoginScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errors, setErrors] = useState({ email: "", password: "" });
  const [rememberMe, setRememberMe] = useState<boolean>(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const { login, loginWithGoogle, isLoading, user, token } = useAuth();

  const isExpoGo = Constants.executionEnvironment === "storeClient";

  const shouldUseWebClient = isExpoGo && Platform.OS === "ios";

  const platformFallbackClientId =
    googleOAuthConfig.webClientId ||
    googleOAuthConfig.iosClientId ||
    googleOAuthConfig.androidClientId ||
    "placeholder-client-id";

  const scheme = Constants.expoConfig?.scheme || "aidefcommobile";

  const googleAuthRequestConfig: Partial<GoogleAuthRequestConfig> = {
    clientId: shouldUseWebClient
      ? googleOAuthConfig.webClientId || platformFallbackClientId
      : platformFallbackClientId,
    iosClientId: shouldUseWebClient
      ? undefined
      : googleOAuthConfig.iosClientId || platformFallbackClientId,
    androidClientId:
      googleOAuthConfig.androidClientId || platformFallbackClientId,
    webClientId: googleOAuthConfig.webClientId || platformFallbackClientId,
    responseType: "id_token",
    selectAccount: true,
    redirectUri: isExpoGo
      ? `https://auth.expo.io/@anonymous/aidefcommobile`
      : Platform.select({
          ios: undefined,
          android: `${scheme}:/oauth2redirect`,
          web: undefined,
        }),
  };

  const [googleRequest, googleResponse, promptGoogleLogin] =
    Google.useAuthRequest(googleAuthRequestConfig);

  useEffect(() => {
    console.log("=== Google OAuth Config Debug ===");
    console.log("isExpoGo:", isExpoGo);
    console.log("Platform.OS:", Platform.OS);
    console.log("shouldUseWebClient:", shouldUseWebClient);
    console.log(
      "googleAuthRequestConfig:",
      JSON.stringify(googleAuthRequestConfig, null, 2)
    );
    console.log("===================================");
  }, [isExpoGo, shouldUseWebClient]);

  useEffect(() => {
    const processGoogleResponse = async () => {
      if (googleResponse?.type === "success") {
        const idToken = googleResponse.authentication?.idToken;
        if (idToken) {
          await handleGoogleLogin(idToken);
        } else {
          Toast.show({
            type: "error",
            text1: "Google login",
            text2: "Failed to get token from Google",
          });
        }
      } else if (googleResponse?.type === "error") {
        Toast.show({
          type: "error",
          text1: "Google login",
          text2: "Google login failed",
        });
      }
    };

    processGoogleResponse();
  }, [googleResponse]);

  const validateForm = () => {
    const newErrors = { email: "", password: "" };
    let isValid = true;

    if (!email.trim()) {
      newErrors.email = "Please enter email";
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Invalid email";
      isValid = false;
    }

    if (!password.trim()) {
      newErrors.password = "Please enter password";
      isValid = false;
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;

    const success = await login(email.trim(), password);
    if (success) {
      setTimeout(async () => {
        const currentUser = user;
        const currentToken = token;
        if (currentUser?.id && currentToken) {
          await navigateByEnrollmentStatus(
            currentUser.id,
            currentToken,
            navigation
          );
        } else {
          navigation.replace("VoiceRegistration");
        }
      }, 300);
    } else {
      Toast.show({
        type: "error",
        text1: "Login Failed",
        text2: "Invalid email or password",
      });
    }
  };

  const handleGoogleLogin = async (googleToken: string) => {
    setIsGoogleLoading(true);
    const success = await loginWithGoogle(googleToken);
    if (!success) {
      Toast.show({
        type: "error",
        text1: "Google login",
        text2: "Google login failed",
      });
    } else {
      setTimeout(async () => {
        const currentUser = user;
        const currentToken = token;
        if (currentUser?.id && currentToken) {
          await navigateByEnrollmentStatus(
            currentUser.id,
            currentToken,
            navigation
          );
        } else {
          navigation.replace("VoiceRegistration");
        }
      }, 300);
    }
    setIsGoogleLoading(false);
  };

  const canUseGoogleLogin = Boolean(
    googleOAuthConfig.webClientId ||
      googleOAuthConfig.iosClientId ||
      googleOAuthConfig.androidClientId
  );

  const handleGoogleButtonPress = async () => {
    if (!canUseGoogleLogin) {
      Toast.show({
        type: "error",
        text1: "Google login not configured",
        text2: "Please add Google OAuth Client IDs to app.json",
        visibilityTime: 4000,
      });
      console.warn(
        "Google OAuth not configured. Please add Client IDs to app.json extra section:",
        {
          googleWebClientId: "your-web-client-id",
          googleIosClientId: "your-ios-client-id",
          googleAndroidClientId: "your-android-client-id",
        }
      );
      return;
    }

    if (!googleRequest) {
      Toast.show({
        type: "error",
        text1: "Google login",
        text2: "Google login not ready. Please try again.",
      });
      return;
    }

    try {
      await promptGoogleLogin();
    } catch (error: any) {
      console.error("Google login error:", error);
      Toast.show({
        type: "error",
        text1: "Google login failed",
        text2: error.message || "Please try again",
      });
    }
  };

  if (isLoading) {
    return <Loading message="Logging in..." />;
  }

  const isSubmitting = isLoading || isGoogleLoading;

  return (
    <KeyboardAvoidingView
      style={globalStyles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar style="auto" />
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoContainer}>
          <Image
            source={require("../../assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.logoTitle}>AIDefCom</Text>
          <Text style={styles.logoSubtitle}>
            AI Defense Committee Management System
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Sign In</Text>
          <Text style={styles.subtitle}>
            Access the Defense Committee Management System
          </Text>

          <TouchableOpacity
            style={[
              styles.googleButton,
              isSubmitting && styles.disabledButton,
              !canUseGoogleLogin && styles.googleButtonWarning,
            ]}
            onPress={handleGoogleButtonPress}
            disabled={isSubmitting}
          >
            {isGoogleLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <AntDesign name="google" size={20} color={colors.primary} />
                <Text style={styles.googleButtonText}>Sign in with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <View
              style={[
                styles.inputWrapper,
                errors.email ? styles.inputErrorBorder : undefined,
              ]}
            >
              <MaterialIcons
                name="email"
                size={20}
                color={colors.textSecondary}
              />
              <TextInput
                style={styles.input}
                placeholder="your.email@example.com"
                placeholderTextColor={colors.placeholder}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (errors.email) setErrors({ ...errors, email: "" });
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {errors.email ? (
              <Text style={globalStyles.errorText}>{errors.email}</Text>
            ) : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View
              style={[
                styles.inputWrapper,
                errors.password ? styles.inputErrorBorder : undefined,
              ]}
            >
              <MaterialIcons
                name="lock"
                size={20}
                color={colors.textSecondary}
              />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor={colors.placeholder}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (errors.password) setErrors({ ...errors, password: "" });
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => setShowPassword((prev: boolean) => !prev)}
              >
                <MaterialIcons
                  name={showPassword ? "visibility" : "visibility-off"}
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
            {errors.password ? (
              <Text style={globalStyles.errorText}>{errors.password}</Text>
            ) : null}
          </View>

          <View style={styles.rememberRow}>
            <TouchableOpacity
              style={[
                styles.checkbox,
                rememberMe ? styles.checkboxChecked : undefined,
              ]}
              onPress={() => setRememberMe((prev) => !prev)}
            >
              {rememberMe ? (
                <MaterialIcons name="check" size={16} color={colors.surface} />
              ) : null}
            </TouchableOpacity>
            <Text style={styles.rememberText}>Remember me</Text>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, isSubmitting && styles.disabledButton]}
            onPress={handleLogin}
            disabled={isSubmitting}
          >
            <LinearGradient
              colors={["#4f46e5", "#7c3aed"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.loginGradient}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.loginText}>Login</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: 16,
  },
  logoTitle: {
    fontSize: 28,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  logoSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  googleButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 24,
    backgroundColor: colors.surface,
  },
  googleButtonWarning: {
    borderColor: "#fbbf24",
    backgroundColor: "#fef3c7",
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
    letterSpacing: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 16,
    color: colors.text,
  },
  inputErrorBorder: {
    borderColor: colors.error,
  },
  iconButton: {
    padding: 6,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rememberText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  loginButton: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 24,
  },
  loginGradient: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  loginText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.6,
  },
});
