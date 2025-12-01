import { voiceService, type VoiceResponse } from "../services/voiceService";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/**
 * Check enrollment status and navigate to appropriate screen
 * - If enrolled (3 samples) → navigate to VoiceAuth
 * - If not enrolled → navigate to VoiceRegistration
 */
export async function navigateByEnrollmentStatus(
  userId: string,
  token: string | null,
  navigation: NavigationProp
) {
  try {
    console.log("🚀 Starting enrollment status check for navigation...");
    
    // Call API directly (it already has timeout handling)
    const status = await voiceService.getEnrollmentStatus(userId, token);

    console.log("📋 Enrollment status result:", {
      enrollment_count: status.enrollment_count,
      enrollment_status: status.enrollment_status,
      is_complete: status.is_complete,
    });

    const enrollmentCount = status.enrollment_count ?? 0;
    const minRequired = status.min_required ?? 3;
    const isComplete =
      status.is_complete ||
      status.enrollment_status === "enrolled" ||
      enrollmentCount >= minRequired;

    if (isComplete) {
      console.log("✅ User is enrolled - navigating to VoiceAuth");
      // User already enrolled → go to voice check/verification
      navigation.replace("VoiceAuth");
    } else {
      console.log("📝 User not enrolled - navigating to VoiceRegistration");
      // User not enrolled → go to registration
      navigation.replace("VoiceRegistration");
    }
  } catch (error: any) {
    console.error("❌ Error in navigateByEnrollmentStatus:", {
      error: error.message,
      stack: error.stack,
    });
    // On error, default to registration screen (fail fast)
    console.log("⚠️ Defaulting to VoiceRegistration due to error");
    navigation.replace("VoiceRegistration");
  }
}

