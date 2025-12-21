import { voiceService, type VoiceResponse } from "../services/voiceService";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export async function navigateByEnrollmentStatus(
  userId: string,
  token: string | null,
  navigation: NavigationProp
) {
  try {
    console.log("🚀 Starting enrollment status check for navigation...");
    
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
      navigation.replace("VoiceAuth");
    } else {
      console.log("📝 User not enrolled - navigating to VoiceRegistration");
      navigation.replace("VoiceRegistration");
    }
  } catch (error: any) {
    console.error("❌ Error in navigateByEnrollmentStatus:", {
      error: error.message,
      stack: error.stack,
    });
    console.log("⚠️ Defaulting to VoiceRegistration due to error");
    navigation.replace("VoiceRegistration");
  }
}

