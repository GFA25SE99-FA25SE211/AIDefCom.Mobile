import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Animated,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import Toast from "react-native-toast-message";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, globalStyles } from "../utils/styles";
import { VOICE_AUTH_CONFIG } from "../utils/constants";
import { voiceService } from "../services/voiceService";
import { useAuth } from "../context/AuthContext";
import { RootStackParamList } from "../navigation/AppNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const RECORDING_DURATION = 15; // 15 seconds per sample

type SampleStatus = "pending" | "recording" | "processing" | "verified" | "failed";

interface SampleInfo {
  status: SampleStatus;
  index: number;
  uri?: string;
  score?: number; // Verification score if verified
}

export const VoiceAuthScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { token, user } = useAuth();

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [currentSampleIndex, setCurrentSampleIndex] = useState(0);
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [countdown, setCountdown] = useState(RECORDING_DURATION);
  const [statusMessage, setStatusMessage] = useState("Nhấn nút để bắt đầu xác thực giọng nói sample 1");
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const progressAnimation = useRef(new Animated.Value(0)).current;

  const totalSamples = VOICE_AUTH_CONFIG.REQUIRED_SAMPLES;
  const prompts = VOICE_AUTH_CONFIG.PROMPTS;

  useEffect(() => {
    if (!user) {
      navigation.replace("Login");
      return;
    }

    // Initialize samples
    const initialSamples = Array.from({ length: totalSamples }, (_, i) => ({
      status: "pending" as SampleStatus,
      index: i,
    }));
    setSamples(initialSamples);

    // Cleanup on unmount
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => null);
      }
    };
  }, [user, navigation, totalSamples]);

  const getPromptForIndex = (index: number) => {
    const raw = prompts[Math.min(index, prompts.length - 1)] || prompts[0] || "";
    const displayName = user?.name || user?.email?.split("@")[0] || "tôi";
    return raw.replace("{Dán tên người nói vào}", displayName);
  };

  const currentPrompt = getPromptForIndex(currentSampleIndex);
  const verifiedCount = samples.filter((s) => s.status === "verified").length;
  const progress = verifiedCount / totalSamples;

  // Update progress animation
  useEffect(() => {
    Animated.timing(progressAnimation, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnimation]);

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Microphone access denied",
          "Please enable microphone permission to continue"
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setRecording(recording);
      setIsRecording(true);
      setStatusMessage(`Đang ghi âm sample ${currentSampleIndex + 1} để xác thực...`);

      // Update sample status
      setSamples((prev) => {
        const updated = [...prev];
        updated[currentSampleIndex] = { ...updated[currentSampleIndex], status: "recording" };
        return updated;
      });

      // Start countdown
      setCountdown(RECORDING_DURATION);
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            stopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error) {
      console.error("Failed to start recording", error);
      Toast.show({
        type: "error",
        text1: "Recording error",
        text2: "Unable to access microphone",
      });
    }
  };

  const stopRecording = async () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    if (!recording && !recordingRef.current) return;

    const currentRecording = recording || recordingRef.current;
    if (!currentRecording) return;

    setIsRecording(false);
    setStatusMessage(`Đang xác thực sample ${currentSampleIndex + 1}...`);

    // Update sample status
    setSamples((prev) => {
      const updated = [...prev];
      updated[currentSampleIndex] = { ...updated[currentSampleIndex], status: "processing" };
      return updated;
    });

    try {
      await currentRecording.stopAndUnloadAsync();
      const uri = currentRecording.getURI();

      if (!uri) {
        throw new Error("No audio file found");
      }

      if (!user?.id) {
        throw new Error("Không tìm thấy thông tin người dùng");
      }

      const result = await voiceService.verifyVoiceSample(uri, user.id, token);

      // Check if verification is successful
      const isVerified = result.verified === true;
      const score = result.score;

      if (isVerified) {
        // Update sample status
        setSamples((prev) => {
          const updated = [...prev];
          updated[currentSampleIndex] = {
            ...updated[currentSampleIndex],
            status: "verified",
            score: score,
          };

          // Check if all samples are verified
          const newVerifiedCount = updated.filter((s) => s.status === "verified").length;

          if (newVerifiedCount >= totalSamples) {
            // All samples verified
            setStatusMessage("Xác thực thành công! Đang chuyển hướng...");
            Toast.show({
              type: "success",
              text1: "Voice authenticated",
              text2: "Welcome back!",
            });
            setTimeout(() => {
              navigation.replace("Dashboard");
            }, 1500);
          } else {
            // Move to next sample
            setTimeout(() => {
              const nextIndex = updated.findIndex((s) => s.status === "pending" || s.status === "failed");
              if (nextIndex >= 0) {
                setCurrentSampleIndex(nextIndex);
                setStatusMessage(`Đã xác thực ${newVerifiedCount}/${totalSamples} mẫu. Nhấn nút để xác thực mẫu tiếp theo.`);
              }
            }, 100);
          }

          return updated;
        });
      } else {
        // Check if error is due to insufficient enrollment samples
        const errorMessage = result.message || "";
        const needsMoreSamples =
          (errorMessage.includes("needs") && errorMessage.includes("more samples")) ||
          errorMessage.includes("not enrolled") ||
          errorMessage.includes("complete enrollment");

        if (needsMoreSamples) {
          // User doesn't have enough samples → redirect to registration
          Toast.show({
            type: "error",
            text1: "Chưa đủ mẫu giọng nói",
            text2: "Vui lòng hoàn tất đăng ký 3 mẫu giọng nói trước",
          });
          setTimeout(() => {
            navigation.replace("VoiceRegistration");
          }, 1500);
        } else {
          // Verification failed (voice not matched)
          setStatusMessage(result.message || "Giọng nói không khớp. Vui lòng thử lại.");
          setSamples((prev) => {
            const updated = [...prev];
            updated[currentSampleIndex] = { ...updated[currentSampleIndex], status: "failed" };
            return updated;
          });
          Toast.show({
            type: "error",
            text1: "Xác thực thất bại",
            text2: result.message || "Giọng nói không khớp. Vui lòng thử lại.",
          });
        }
      }
    } catch (error: any) {
      console.error("Voice verification failed", error);
      setStatusMessage(error.message || "Xác thực thất bại. Vui lòng thử lại.");
      setSamples((prev) => {
        const updated = [...prev];
        updated[currentSampleIndex] = { ...updated[currentSampleIndex], status: "failed" };
        return updated;
      });
      Toast.show({
        type: "error",
        text1: "Voice verification failed",
        text2: error.message || "Please try again",
      });
    } finally {
      setRecording(null);
      recordingRef.current = null;
      setCountdown(RECORDING_DURATION);
    }
  };

  const handleMicrophonePress = () => {
    if (isRecording) {
      stopRecording();
    } else {
      const nextIndex = samples.findIndex((s) => s.status === "pending" || s.status === "failed");
      if (nextIndex >= 0) {
        setCurrentSampleIndex(nextIndex);
        startRecording();
      }
    }
  };

  const retrySample = (index: number) => {
    setCurrentSampleIndex(index);
    setSamples((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        status: "pending",
        uri: undefined,
      };
      return updated;
    });
    setStatusMessage(`Nhấn nút để xác thực lại sample ${index + 1}`);
  };

  return (
    <View style={globalStyles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <MaterialIcons name="shield" size={36} color="#ffffff" />
          </View>
          <Text style={styles.heroTitle}>Voice Authentication</Text>
          <Text style={styles.heroSubtitle}>
            Xác thực giọng nói của bạn (cần {totalSamples} mẫu)
          </Text>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBackground}>
            <Animated.View
              style={[
                styles.progressBarFill,
                {
                  width: progressAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {verifiedCount}/{totalSamples} samples đã xác thực
          </Text>
        </View>

        {/* Step Indicator */}
        <View style={styles.stepIndicator}>
          {samples.map((sample, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => {
                if (sample.status === "failed") {
                  retrySample(index);
                }
              }}
              disabled={sample.status !== "failed"}
            >
              <View
                style={[
                  styles.stepDot,
                  index === currentSampleIndex &&
                    isRecording &&
                    styles.stepDotActive,
                  sample.status === "verified" && styles.stepDotVerified,
                  sample.status === "failed" && styles.stepDotFailed,
                  sample.status === "processing" && styles.stepDotProcessing,
                ]}
              >
                {sample.status === "failed" && (
                  <MaterialIcons name="error" size={10} color="#ffffff" />
                )}
                {sample.status === "processing" && (
                  <ActivityIndicator size={8} color="#ffffff" />
                )}
                {sample.status === "verified" && (
                  <MaterialIcons name="check" size={10} color="#ffffff" />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Prompt Card */}
        <View style={styles.promptCard}>
          <View style={styles.promptHeader}>
            <MaterialIcons name="volume-up" size={20} color="#10b981" />
            <Text style={styles.promptHeaderText}>
              Please read this phrase clearly:
            </Text>
          </View>
          <Text style={styles.promptText}>"{currentPrompt}"</Text>
        </View>

        <View style={styles.card}>
          {/* Countdown Timer */}
          {isRecording && (
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownText}>{countdown}s</Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.microphoneButton,
              isRecording && styles.microphoneButtonActive,
              samples[currentSampleIndex]?.status === "processing" &&
                styles.microphoneButtonProcessing,
            ]}
            onPress={handleMicrophonePress}
            activeOpacity={0.85}
            disabled={samples[currentSampleIndex]?.status === "processing" || (samples[currentSampleIndex]?.status === "verified" && verifiedCount < totalSamples)}
          >
            {samples[currentSampleIndex]?.status === "processing" ? (
              <ActivityIndicator size="large" color="#ffffff" />
            ) : (
              <MaterialIcons name="mic" size={48} color="#ffffff" />
            )}
          </TouchableOpacity>
          <Text style={styles.cardTitle}>Tap the microphone to start</Text>
          <Text style={styles.cardSubtitle}>{statusMessage}</Text>
        </View>

        <View style={styles.tipsCard}>
          <View style={styles.tipsHeader}>
            <MaterialIcons name="info" size={20} color="#10b981" />
            <Text style={styles.tipsTitle}>Tips for best results</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>Speak in a quiet environment</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>Use your normal speaking voice</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>Hold the device close to your mouth</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>Read the phrase clearly when prompted</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    marginTop: 40,
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
  },
  progressContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: "#e5e7eb",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#10b981",
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
  },
  stepIndicator: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    backgroundColor: "#3b82f6",
  },
  stepDotVerified: {
    backgroundColor: "#10b981",
  },
  stepDotFailed: {
    backgroundColor: "#ef4444",
  },
  stepDotProcessing: {
    backgroundColor: "#f59e0b",
  },
  promptCard: {
    backgroundColor: "#d1fae5",
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  promptHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  promptHeaderText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#065f46",
  },
  promptText: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
  },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    borderRadius: 24,
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 8,
    marginBottom: 24,
  },
  countdownContainer: {
    marginBottom: 16,
  },
  countdownText: {
    fontSize: 48,
    fontWeight: "700",
    color: "#3b82f6",
  },
  microphoneButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  microphoneButtonActive: {
    backgroundColor: "#f97316",
  },
  microphoneButtonProcessing: {
    backgroundColor: "#9ca3af",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
  },
  tipsCard: {
    backgroundColor: "#d1fae5",
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
  },
  tipsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#065f46",
  },
  tipItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  tipBullet: {
    color: "#065f46",
    fontSize: 18,
    marginRight: 6,
  },
  tipText: {
    color: colors.textSecondary,
    flex: 1,
  },
});
