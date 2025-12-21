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
import { LinearGradient } from "expo-linear-gradient";
import { colors, globalStyles } from "../utils/styles";
import { VOICE_AUTH_CONFIG } from "../utils/constants";
import { voiceService } from "../services/voiceService";
import { useAuth } from "../context/AuthContext";
import { RootStackParamList } from "../navigation/AppNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const RECORDING_DURATION = 15;
const SAMPLE_RATE = 16000;

type SampleStatus =
  | "pending"
  | "recording"
  | "processing"
  | "verified"
  | "failed";

interface SampleInfo {
  status: SampleStatus;
  index: number;
  uri?: string;
  score?: number;
}

export const VoiceAuthScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { token, user } = useAuth();

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [currentSampleIndex, setCurrentSampleIndex] = useState(0);
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [countdown, setCountdown] = useState(RECORDING_DURATION);
  const [statusMessage, setStatusMessage] = useState(
    "Tap the microphone and speak naturally"
  );
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const progressAnimation = useRef(new Animated.Value(0)).current;

  const totalSamples = 1;
  const prompts = VOICE_AUTH_CONFIG.PROMPTS;

  useEffect(() => {
    if (!user) {
      navigation.replace("Login");
      return;
    }

    const initialSamples = Array.from({ length: totalSamples }, (_, i) => ({
      status: "pending" as SampleStatus,
      index: i,
    }));
    setSamples(initialSamples);

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
    const raw =
      prompts[Math.min(index, prompts.length - 1)] || prompts[0] || "";
    const emailName =
      user?.email && user.email.includes("@")
        ? user.email.split("@")[0]
        : undefined;
    const displayName = user?.fullName || emailName || "me";
    return raw.replace("{Tên người nói}", displayName);
  };

  const currentPrompt = getPromptForIndex(0); // Always use first prompt for verification

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
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

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

      const { recording } = await Audio.Recording.createAsync(recordingOptions);

      recordingRef.current = recording;
      setRecording(recording);
      setIsRecording(true);
      setStatusMessage("Recording... tap again to finish");

      setSamples((prev) => {
        const updated = [...prev];
        updated[currentSampleIndex] = {
          ...updated[currentSampleIndex],
          status: "recording",
        };
        return updated;
      });

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
    setStatusMessage("Processing your voice sample...");

    setSamples((prev) => {
      const updated = [...prev];
      updated[currentSampleIndex] = {
        ...updated[currentSampleIndex],
        status: "processing",
      };
      return updated;
    });

    try {
      await currentRecording.stopAndUnloadAsync();
      const uri = currentRecording.getURI();

      if (!uri) {
        throw new Error("No audio file found");
      }

      if (!user?.id) {
        throw new Error("User information not found");
      }

      const result = await voiceService.verifyVoiceSample(uri, user.id, token);

      const isVerified = result.verified === true;
      const score = result.score;

      if (isVerified) {
        setSamples((prev) => {
          const updated = [...prev];
          updated[currentSampleIndex] = {
            ...updated[currentSampleIndex],
            status: "verified",
            score: score,
          };

          setStatusMessage("Voice verified! Redirecting...");
          Toast.show({
            type: "success",
            text1: "Voice authenticated",
            text2: "Welcome back!",
          });
          setTimeout(() => {
            navigation.replace("Dashboard");
          }, 1500);

          return updated;
        });
      } else {
        const errorMessage = result.message || "";
        const needsMoreSamples =
          (errorMessage.includes("needs") &&
            errorMessage.includes("more samples")) ||
          errorMessage.includes("not enrolled") ||
          errorMessage.includes("complete enrollment");

        if (needsMoreSamples) {
          Toast.show({
            type: "error",
            text1: "Insufficient voice samples",
            text2: `Please complete registration of 3 voice samples first`,
          });
          setTimeout(() => {
            navigation.replace("VoiceRegistration");
          }, 1500);
        } else {
          setStatusMessage(
            result.message || "Voice not recognized. Please try again."
          );
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
            text1: "Authentication failed",
            text2: result.message || "Voice does not match. Please try again.",
          });
        }
      }
    } catch (error: any) {
      console.error("Voice verification failed", error);
      setStatusMessage(
        error.message || "Voice verification failed. Please try again."
      );
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
    setStatusMessage("Tap the microphone and speak naturally");
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <LinearGradient
              colors={["#4f46e5", "#7c3aed"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroIconGradient}
            >
              <MaterialIcons name="shield" size={36} color="#ffffff" />
            </LinearGradient>
          </View>
          <Text style={styles.heroTitle}>Voice Authentication</Text>
          <Text style={styles.heroSubtitle}>
            Speak naturally to authenticate your identity
          </Text>
        </View>

        {currentPrompt && (
          <View style={styles.promptCard}>
            <View style={styles.promptHeader}>
              <MaterialIcons name="volume-up" size={20} color="#4f46e5" />
              <Text style={styles.promptHeaderText}>
                Please read this phrase clearly:
              </Text>
            </View>
            <Text style={styles.promptText}>"{currentPrompt}"</Text>
          </View>
        )}

        <View style={styles.card}>
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
              samples[currentSampleIndex]?.status === "verified"
            }
          >
            <LinearGradient
              colors={
                isRecording
                  ? ["#f97316", "#ea580c"]
                  : samples[currentSampleIndex]?.status === "processing"
                  ? ["#9ca3af", "#6b7280"]
                  : ["#4f46e5", "#7c3aed"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.microphoneButtonGradient}
            >
              {samples[currentSampleIndex]?.status === "processing" ? (
                <ActivityIndicator size="large" color="#ffffff" />
              ) : (
                <MaterialIcons name="mic" size={48} color="#ffffff" />
              )}
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.cardTitle}>Tap the microphone to start</Text>
          <Text style={styles.cardSubtitle}>{statusMessage}</Text>
        </View>

        {samples[0]?.status === "processing" && (
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>Verifying your voice...</Text>
          </View>
        )}

        <View style={styles.tipsCard}>
          <View style={styles.tipsHeader}>
            <MaterialIcons name="info" size={20} color="#4f46e5" />
            <Text style={styles.tipsTitle}>Tips for best results:</Text>
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
            <Text style={styles.tipText}>
              Hold the device close to your mouth
            </Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>
              Say a few words naturally when prompted
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6", // Light purple-grey background
  },
  scrollContent: {
    paddingBottom: 24,
  },
  hero: {
    alignItems: "center",
    marginTop: 60,
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    marginBottom: 16,
    overflow: "hidden",
  },
  heroIconGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#4f46e5", // Blue
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: "#6b7280", // Dark grey
    textAlign: "center",
  },
  promptCard: {
    backgroundColor: "#eef2ff", // Light purple
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  promptHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  promptHeaderText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4f46e5",
  },
  promptText: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
  },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: 20,
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
    color: "#4f46e5",
  },
  microphoneButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 24,
    overflow: "hidden",
  },
  microphoneButtonGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  microphoneButtonActive: {
  },
  microphoneButtonProcessing: {
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
  progressContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
    alignItems: "center",
  },
  progressText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  stepIndicator: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
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
    backgroundColor: "#4f46e5",
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
  tipsCard: {
    backgroundColor: colors.surface,
    marginHorizontal: 20,
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
    marginRight: 8,
  },
  tipText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 14,
  },
});
