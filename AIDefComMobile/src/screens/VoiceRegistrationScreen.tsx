import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
  Linking,
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
const SAMPLE_RATE = 16000;

type SampleStatus = "pending" | "recording" | "processing" | "completed" | "failed";

interface SampleInfo {
  status: SampleStatus;
  index: number;
  uri?: string;
}

export const VoiceRegistrationScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { token, user } = useAuth();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [currentSampleIndex, setCurrentSampleIndex] = useState(0);
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [countdown, setCountdown] = useState(RECORDING_DURATION);
  const [statusMessage, setStatusMessage] = useState("Nhấn nút để bắt đầu ghi âm sample 1");
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const progressAnimation = useRef(new Animated.Value(0)).current;

  const totalSamples = VOICE_AUTH_CONFIG.REQUIRED_SAMPLES;
  const prompts = VOICE_AUTH_CONFIG.PROMPTS;

  // Check enrollment status on mount – if already enrolled, go to VoiceAuth
  useEffect(() => {
    const checkEnrollmentStatus = async () => {
      try {
        if (!user?.id) {
          return;
        }

        setStatusMessage("Đang kiểm tra...");

        // Fast check with timeout (5 seconds max)
        const status = await Promise.race([
          voiceService.getEnrollmentStatus(user.id, token),
          new Promise<any>((resolve) =>
            setTimeout(
              () =>
                resolve({
                  enrollment_status: "not_enrolled",
                  enrollment_count: 0,
                  is_complete: false,
                }),
              5000 // 5 seconds max
            )
          ),
        ]);

        const enrollmentCount = status.enrollment_count ?? 0;
        const minRequired = status.min_required ?? VOICE_AUTH_CONFIG.REQUIRED_SAMPLES;
        const isComplete =
          status.is_complete ||
          status.enrollment_status === "enrolled" ||
          enrollmentCount >= minRequired;

        if (isComplete) {
          // User already has enough samples → go to VoiceAuth screen immediately (no delay)
          navigation.replace("VoiceAuth");
          return;
        }

        // Not yet complete → keep on registration screen
        setStatusMessage("Nhấn nút để bắt đầu ghi âm sample 1");
      } catch (error: any) {
        console.error("Failed to check enrollment status:", error);
        // Fail fast - just continue with registration
        setStatusMessage("Nhấn nút để bắt đầu ghi âm sample 1");
      }
    };

    checkEnrollmentStatus();
    // Only run once when screen mounts / user changes
  }, [navigation, token, user?.id]);

  // Initialize samples
  useEffect(() => {
    if (samples.length === 0) {
      const initialSamples: SampleInfo[] = Array.from(
        { length: totalSamples },
        (_, i) => ({
          status: "pending",
          index: i,
        })
      );
      setSamples(initialSamples);
    }
  }, [totalSamples]);

  // Update progress animation
  useEffect(() => {
    const completedCount = samples.filter((s) => s.status === "completed").length;
    Animated.timing(progressAnimation, {
      toValue: completedCount / totalSamples,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [samples, totalSamples]);

  const getPromptForIndex = (index: number) => {
    const raw = prompts[Math.min(index, prompts.length - 1)] || prompts[0] || "";
    const emailName =
      user?.email && user.email.includes("@")
        ? user.email.split("@")[0]
        : undefined;
    const displayName = user?.fullName || emailName || "tôi";
    return raw.replace("{Dán tên người nói vào}", displayName);
  };

  const currentPrompt = getPromptForIndex(currentSampleIndex);
  const completedCount = samples.filter((s) => s.status === "completed").length;

  const resetRecording = () => {
    setRecording(null);
    recordingRef.current = null;
    setIsRecording(false);
    setCountdown(RECORDING_DURATION);
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      resetRecording();

      console.log("🔐 Requesting microphone permissions...");
      const permission = await Audio.requestPermissionsAsync();

      console.log("📋 Permission status:", {
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
        status: permission.status,
      });

      if (!permission.granted) {
        let message = "Quyền truy cập microphone bị từ chối.";
        let showSettingsButton = false;

        if (Platform.OS === "ios") {
          if (!permission.canAskAgain) {
            message += "\n\nVui lòng vào Settings → AIDefComMobile → Microphone để bật quyền.";
            showSettingsButton = true;
          } else {
            message += "\n\nVui lòng cấp quyền microphone để tiếp tục.";
          }
        }

        Alert.alert(
          "Quyền truy cập microphone bị từ chối",
          message,
          [
            { text: "Hủy", style: "cancel" },
            ...(showSettingsButton
              ? [
                  {
                    text: "Mở Settings",
                    onPress: async () => {
                      try {
                        await Linking.openSettings();
                      } catch (error) {
                        console.error("Error opening settings:", error);
                      }
                    },
                  },
                ]
              : []),
          ]
        );
        return;
      }

      console.log("✅ Permission granted, setting up audio...");

      // Set audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      await new Promise(resolve => setTimeout(resolve, 500));
      console.log("🔧 Audio mode configured");

      // Recording options
      const recordingOptions = {
        android: {
          extension: ".wav",
          outputFormat: Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate: SAMPLE_RATE,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: ".wav",
          outputFormat: Audio.IOSOutputFormat.LINEARPCM,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: SAMPLE_RATE,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: "audio/wav",
          bitsPerSecond: 128000,
        },
      };

      console.log("🎙️ Creating recording...");
      const { recording: newRecording } = await Audio.Recording.createAsync(
        recordingOptions
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      const status = await newRecording.getStatusAsync();
      console.log("📊 Initial status:", status);

      if (!status.isRecording) {
        throw new Error("Recording không khởi động được. Vui lòng kiểm tra microphone.");
      }

      if (!status.canRecord) {
        throw new Error("Microphone không sẵn sàng để ghi âm.");
      }

      setRecording(newRecording);
      recordingRef.current = newRecording; // Lưu vào ref để dùng trong countdown
      setIsRecording(true);
      setCountdown(RECORDING_DURATION);
      setStatusMessage(`Đang ghi âm sample ${currentSampleIndex + 1}...`);

      // Update sample status
      setSamples((prev) => {
        const updated = [...prev];
        updated[currentSampleIndex] = {
          ...updated[currentSampleIndex],
          status: "recording",
        };
        return updated;
      });

      // Lưu recording vào ref để dùng trong countdown
      recordingRef.current = newRecording;

      // Start countdown timer - tự động dừng sau 15 giây
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          const newValue = prev - 1;
          if (newValue <= 0) {
            // Clear interval ngay lập tức
            if (countdownRef.current) {
              clearInterval(countdownRef.current);
              countdownRef.current = null;
            }
            // Tự động dừng recording ngay khi countdown về 0
            console.log("⏰ Countdown reached 0, auto-stopping recording...");
            // Gọi stopRecording ngay, không cần check state
            setTimeout(() => {
              const currentRec = recordingRef.current;
              if (currentRec) {
                stopRecording();
              }
            }, 50); // Giảm delay xuống 50ms
            return 0;
          }
          return newValue;
        });
      }, 1000);

      // Monitor recording
      newRecording.setOnRecordingStatusUpdate((status) => {
        if (!status.isRecording && isRecording) {
          console.warn("⚠️ Recording stopped unexpectedly");
        }
      });

      Toast.show({
        type: "info",
        text1: "Đang ghi âm",
        text2: `Sample ${currentSampleIndex + 1}/${totalSamples}`,
      });
    } catch (error: any) {
      console.error("❌ Failed to start recording:", error);
      Alert.alert("Lỗi", error.message || "Không thể bắt đầu ghi âm");
      resetRecording();
    }
  };

  const stopRecording = async () => {
    // Lấy recording từ ref hoặc state
    const currentRecording = recordingRef.current || recording;
    
    // Nếu không có recording và không đang recording, return
    if (!currentRecording && !isRecording) {
      console.log("⚠️ stopRecording called but no recording");
      return;
    }

    // Nếu đã đang processing, không cho stop lại
    if (samples[currentSampleIndex]?.status === "processing") {
      console.log("⚠️ Already processing, cannot stop");
      return;
    }

    try {
      // Clear countdown timer first
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }

      setIsRecording(false);
      setCountdown(0); // Set countdown về 0 để UI update
      setStatusMessage(`Đang tải sample ${currentSampleIndex + 1} lên server...`);

      // Update sample status to processing
      setSamples((prev) => {
        const updated = [...prev];
        updated[currentSampleIndex] = {
          ...updated[currentSampleIndex],
          status: "processing",
        };
        return updated;
      });

      if (!currentRecording) {
        console.warn("⚠️ No recording instance to stop");
        resetRecording();
        return;
      }

      const status = await currentRecording.getStatusAsync();
      console.log("📊 Final status:", status);

      // Stop recording nếu vẫn đang recording
      if (status.isRecording) {
        console.log("🛑 Stopping active recording...");
        await currentRecording.stopAndUnloadAsync();
        console.log("✅ Recording stopped successfully");
      } else {
        console.log("ℹ️ Recording was already stopped");
        // Vẫn cần unload để giải phóng tài nguyên
        try {
          await currentRecording.stopAndUnloadAsync();
        } catch (e) {
          console.warn("⚠️ Error unloading recording:", e);
        }
      }

      const uri = currentRecording.getURI();
      console.log("🎵 Recording URI:", uri);

      if (!uri) {
        throw new Error("Không tìm thấy file ghi âm");
      }

      // Validate duration
      const durationSeconds = status.durationMillis
        ? status.durationMillis / 1000
        : 0;

      if (durationSeconds === 0) {
        throw new Error("Recording không thu được âm thanh. Vui lòng thử lại.");
      }

      if (durationSeconds < 10) {
        throw new Error(
          `Recording quá ngắn (${durationSeconds.toFixed(1)}s). Vui lòng ghi ít nhất 10 giây.`
        );
      }

      // Upload to server
      if (!user?.id) {
        throw new Error("Không tìm thấy thông tin người dùng");
      }

      console.log("📤 Uploading sample to server...");
      const response = await voiceService.registerVoiceSample({
        audioUri: uri,
        userId: user.id,
        token,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const enrollmentCount = Number(
        response.enrollment_count ?? response.enrollmentCount ?? 0
      );
      const isComplete =
        response.is_complete ?? response.completed ?? false;
      const minRequired = Number(response.min_required ?? 3);

      console.log("📊 Enrollment response:", {
        enrollmentCount,
        isComplete,
        minRequired,
        message: response.message,
      });

      let nextSampleIndex = -1;
      setSamples((prev) => {
        const updated = [...prev];
        updated[currentSampleIndex] = {
          ...updated[currentSampleIndex],
          status: "completed",
          uri,
        };
        nextSampleIndex = updated.findIndex(
          (s) => s.status === "pending" || s.status === "failed"
        );
        return updated;
      });

      setStatusMessage(`Sample ${currentSampleIndex + 1} đã lưu thành công.`);
      resetRecording();
      Toast.show({
        type: "success",
        position: "top",
        text1: `Sample ${currentSampleIndex + 1} đã lưu`,
        text2: `Đã ghi ${enrollmentCount}/${totalSamples} mẫu`,
      });

      if (isComplete && enrollmentCount >= minRequired) {
        setStatusMessage("Hoàn tất đăng ký giọng nói!");
        Toast.show({
          type: "success",
          position: "top",
          text1: "Đăng ký giọng nói thành công",
          text2: `Đã đăng ký ${enrollmentCount} mẫu giọng nói. Chuyển đến trang chủ...`,
        });
        setTimeout(() => {
          navigation.replace("Dashboard");
        }, 1200);
      } else if (nextSampleIndex >= 0) {
        setCurrentSampleIndex(nextSampleIndex);
        setStatusMessage(
          `Đã ghi ${enrollmentCount}/${totalSamples} mẫu. Nhấn nút để ghi mẫu tiếp theo.`
        );
      }
    } catch (error: any) {
      console.error("❌ Failed to stop/upload recording:", error);
      
      // Check if error is "Maximum enrollment limit reached" - user already has 3 samples
      const errorMessage = error.message || "";
      const isMaxEnrollmentReached = 
        errorMessage.includes("Maximum enrollment limit") ||
        errorMessage.includes("Đã đủ 3 samples") ||
        errorMessage.includes("Đã đủ 3 mẫu");
      
      if (isMaxEnrollmentReached) {
        // User already has 3 samples - redirect to VoiceAuth (verify)
        console.log("✅ User already has 3 samples - redirecting to VoiceAuth");
        setStatusMessage("Đã đủ 3 mẫu giọng nói. Chuyển đến xác thực...");
        Toast.show({
          type: "info",
          position: "top",
          text1: "Đã đủ mẫu giọng nói",
          text2: "Chuyển đến trang xác thực giọng nói",
        });
        setTimeout(() => {
          navigation.replace("VoiceAuth");
        }, 1500);
        resetRecording();
        return;
      }

      setStatusMessage(error.message || "Tải lên thất bại. Vui lòng thử lại.");

      // Mark sample as failed
      setSamples((prev) => {
        const updated = [...prev];
        updated[currentSampleIndex] = {
          ...updated[currentSampleIndex],
          status: "failed",
        };
        return updated;
      });

      Toast.show({
        type: "error",
        position: "top",
        text1: "Đăng ký thất bại",
        text2: error.message || "Vui lòng thử lại",
      });

      resetRecording();
    }
  };

  const handleMicrophonePress = () => {
    if (isRecording) {
      stopRecording();
    } else {
      const nextIndex = samples.findIndex(
        (s) => s.status === "pending" || s.status === "failed"
      );
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
    setStatusMessage(`Nhấn nút để ghi lại sample ${index + 1}`);
  };

  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => null);
      }
    };
  }, []);

  return (
    <View style={globalStyles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <MaterialIcons name="person-add" size={36} color="#ffffff" />
          </View>
          <Text style={styles.heroTitle}>Voice Registration</Text>
          <Text style={styles.heroSubtitle}>
            Register your voice for future authentication
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
            {completedCount}/{totalSamples} samples đã lưu
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
                  sample.status === "completed" && styles.stepDotCompleted,
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
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.promptCard}>
          <View style={styles.promptHeader}>
            <MaterialIcons name="volume-up" size={20} color="#4f46e5" />
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
            disabled={
              samples[currentSampleIndex]?.status === "processing" ||
              completedCount >= totalSamples
            }
          >
            {samples[currentSampleIndex]?.status === "processing" ? (
              <ActivityIndicator size="large" color="#ffffff" />
            ) : isRecording ? (
              <MaterialIcons name="stop" size={48} color="#ffffff" />
            ) : (
              <MaterialIcons name="mic" size={48} color="#ffffff" />
            )}
          </TouchableOpacity>
          <Text style={styles.cardTitle}>
            {isRecording
              ? "Đang ghi âm..."
              : samples[currentSampleIndex]?.status === "processing"
              ? "Đang xử lý..."
              : "Nhấn để bắt đầu ghi âm"}
          </Text>
          <Text style={styles.cardSubtitle}>
            Sample {currentSampleIndex + 1} / {totalSamples}
          </Text>
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>

        <View style={styles.tipsCard}>
          <View style={styles.tipsHeader}>
            <MaterialIcons name="info" size={20} color="#4f46e5" />
            <Text style={styles.tipsTitle}>Tips for best results</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>Record in a quiet environment</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>
              Read the phrase clearly and naturally
            </Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>Speak at a normal pace</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>
              Keep a consistent distance from the microphone
            </Text>
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
    backgroundColor: "#6d5eea",
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
  stepIndicator: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  progressContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: "#e2e8f0",
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
    textAlign: "center",
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    backgroundColor: "#4f46e5",
  },
  stepDotCompleted: {
    backgroundColor: "#10b981",
  },
  stepDotFailed: {
    backgroundColor: "#ef4444",
  },
  stepDotProcessing: {
    backgroundColor: "#f59e0b",
  },
  promptCard: {
    backgroundColor: "#eef2ff",
    marginHorizontal: 16,
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
  },
  promptHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  promptHeaderText: {
    color: "#4f46e5",
    fontWeight: "600",
  },
  promptText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    lineHeight: 26,
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
    position: "relative",
  },
  countdownContainer: {
    marginBottom: 16,
  },
  countdownText: {
    fontSize: 32,
    fontWeight: "700",
    color: "#4f46e5",
    textAlign: "center",
  },
  microphoneButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  microphoneButtonActive: {
    backgroundColor: "#f97316",
  },
  microphoneButtonProcessing: {
    backgroundColor: "#6b7280",
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
  statusText: {
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: "center",
  },
  tipsCard: {
    backgroundColor: "#eef2ff",
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
    color: "#4f46e5",
  },
  tipItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  tipBullet: {
    color: "#4f46e5",
    fontSize: 18,
    marginRight: 6,
  },
  tipText: {
    color: colors.textSecondary,
    flex: 1,
  },
});

