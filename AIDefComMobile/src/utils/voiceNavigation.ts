import { voiceService } from "../services/voiceService";
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
    // Fast check with timeout - if takes too long, default to registration
    const status = await Promise.race([
      voiceService.getEnrollmentStatus(userId, token),
      new Promise<VoiceResponse>((resolve) =>
        setTimeout(
          () =>
            resolve({
              user_id: userId,
              enrollment_status: "not_enrolled",
              enrollment_count: 0,
              min_required: 3,
              is_complete: false,
              success: true,
              message: "Check timeout",
            }),
          6000 // 6 seconds max total wait
        )
      ),
    ]);

    const enrollmentCount = status.enrollment_count ?? 0;
    const minRequired = status.min_required ?? 3;
    const isComplete =
      status.is_complete ||
      status.enrollment_status === "enrolled" ||
      enrollmentCount >= minRequired;

    if (isComplete) {
      // User already enrolled → go to voice check/verification
      navigation.replace("VoiceAuth");
    } else {
      // User not enrolled → go to registration
      navigation.replace("VoiceRegistration");
    }
  } catch (error: any) {
    console.error("Error checking enrollment status:", error);
    // On error, default to registration screen (fail fast)
    navigation.replace("VoiceRegistration");
  }
}

