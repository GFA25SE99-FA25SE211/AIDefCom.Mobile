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

  const platformFallbackClientId =
    googleOAuthConfig.webClientId ||
    googleOAuthConfig.iosClientId ||
    googleOAuthConfig.androidClientId ||
    "placeholder-client-id";

  const googleAuthRequestConfig: Partial<GoogleAuthRequestConfig> = {
    clientId: platformFallbackClientId,
    iosClientId: googleOAuthConfig.iosClientId || platformFallbackClientId,
    androidClientId:
      googleOAuthConfig.androidClientId || platformFallbackClientId,
    webClientId: googleOAuthConfig.webClientId || platformFallbackClientId,
    responseType: "id_token",
    selectAccount: true,
  };

  const [googleRequest, googleResponse, promptGoogleLogin] =
    Google.useAuthRequest(googleAuthRequestConfig);

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
            text2: "Không lấy được token từ Google",
          });
        }
      } else if (googleResponse?.type === "error") {
        Toast.show({
          type: "error",
          text1: "Google login",
          text2: "Google login thất bại",
        });
      }
    };

    processGoogleResponse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse]);

  const validateForm = () => {
    const newErrors = { email: "", password: "" };
    let isValid = true;

    if (!email.trim()) {
      newErrors.email = "Vui lòng nhập email";
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Email không hợp lệ";
      isValid = false;
    }

    if (!password.trim()) {
      newErrors.password = "Vui lòng nhập mật khẩu";
      isValid = false;
    } else if (password.length < 6) {
      newErrors.password = "Mật khẩu phải có ít nhất 6 ký tự";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;

    const success = await login(email.trim(), password);
    if (success) {
      // After login, user and token are set in context
      // Use a small delay to ensure state is updated, then check enrollment
      setTimeout(async () => {
        // Get fresh values from context after state update
        const currentUser = user;
        const currentToken = token;
        if (currentUser?.id && currentToken) {
          await navigateByEnrollmentStatus(currentUser.id, currentToken, navigation);
        } else {
          // Fallback: navigate to registration if user/token not available
          navigation.replace("VoiceRegistration");
        }
      }, 200);
    } else {
      Toast.show({
        type: "error",
        text1: "Đăng nhập thất bại",
        text2: "Tài khoản hoặc mật khẩu không chính xác",
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
        text2: "Đăng nhập Google thất bại",
      });
    } else {
      // After login, user and token are set in context
      // Use a small delay to ensure state is updated, then check enrollment
      setTimeout(async () => {
        // Get fresh values from context after state update
        const currentUser = user;
        const currentToken = token;
        if (currentUser?.id && currentToken) {
          await navigateByEnrollmentStatus(currentUser.id, currentToken, navigation);
        } else {
          // Fallback: navigate to registration if user/token not available
          navigation.replace("VoiceRegistration");
        }
      }, 200);
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
        text1: "Google login",
        text2: "Chưa cấu hình Google OAuth Client ID",
      });
      return;
    }

    if (!googleRequest) {
      Toast.show({
        type: "error",
        text1: "Google login",
        text2: "Google login chưa sẵn sàng. Vui lòng thử lại.",
      });
      return;
    }

    await promptGoogleLogin();
  };

  if (isLoading) {
    return <Loading message="Đang đăng nhập..." />;
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
        <View style={styles.card}>
          <Text style={styles.title}>Sign In</Text>
          <Text style={styles.subtitle}>
            Access the Defense Committee Management System
          </Text>

          <TouchableOpacity
            style={[
              styles.googleButton,
              (isSubmitting || !canUseGoogleLogin) && styles.disabledButton,
            ]}
            onPress={handleGoogleButtonPress}
            disabled={isSubmitting || !canUseGoogleLogin}
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
