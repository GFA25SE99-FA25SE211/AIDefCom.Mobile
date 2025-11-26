import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
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

type RecordingState = "idle" | "recording" | "processing" | "completed" | "error";

export const VoiceRegistrationScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { token, user } = useAuth();
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [samples, setSamples] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState(
    "Tap the mic to record sample 1"
  );
  const totalSamples = VOICE_AUTH_CONFIG.REQUIRED_SAMPLES;
  const prompts = VOICE_AUTH_CONFIG.PROMPTS;

  const getPromptForIndex = (index: number) => {
    const raw =
      prompts[Math.min(index, prompts.length - 1)] || prompts[0] || "";

    // Ưu tiên fullName (Duong Minh Nhan), sau đó mới tới username/email
    const emailName =
      user?.email && user.email.includes("@")
        ? user.email.split("@")[0]
        : undefined;
    const displayName = user?.fullName || emailName || "tôi";

    return raw.replace("{Dán tên người nói vào}", displayName);
  };

  const currentSampleNumber = Math.min(samples.length + 1, totalSamples);
  const currentPrompt = getPromptForIndex(samples.length);

  const resetRecording = useCallback(() => {
    setRecording(null);
    setRecordingState("idle");
  }, []);

  const startRecording = async () => {
    try {
      resetRecording();
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

      setRecording(recording);
      setRecordingState("recording");
      setStatusMessage("Recording... tap again to finish");
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
    if (!recording) return;
    setRecordingState("processing");
    setStatusMessage("Uploading sample...");
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      if (!uri) {
        throw new Error("No audio file found");
      }

      if (!user?.id) {
        throw new Error("Không tìm thấy thông tin người dùng");
      }

      const updatedSamples = [...samples, uri];
      setSamples(updatedSamples);

      if (updatedSamples.length >= totalSamples) {
        setRecordingState("processing");
        setStatusMessage("Uploading samples...");
        await uploadSamples(updatedSamples);
      } else {
        setRecordingState("idle");
        setStatusMessage(
          `Sample ${updatedSamples.length + 1} ready. Tap to record.`
        );
      }
    } catch (error: any) {
      console.error("Voice registration failed", error);
      setRecordingState("error");
      setStatusMessage(error.message || "Upload failed. Please try again.");
      Toast.show({
        type: "error",
        text1: "Registration failed",
        text2: error.message || "Please try again",
      });
      resetRecording();
    }
  };

  const handleMicrophonePress = () => {
    if (recordingState === "recording") {
      stopRecording();
    } else if (
      recordingState === "idle" ||
      recordingState === "error"
    ) {
      startRecording();
    }
  };

  const uploadSamples = useCallback(
    async (sampleUris: string[]) => {
      if (!user?.id) {
        throw new Error("Không tìm thấy thông tin người dùng");
      }

      try {
        for (let i = 0; i < totalSamples; i++) {
          const prompt = getPromptForIndex(i);
          await voiceService.registerVoiceSample({
            audioUri: sampleUris[i],
            sampleIndex: i + 1,
            totalSamples,
            prompt,
            userId: user.id,
            token,
          });
        }

        setRecordingState("completed");
        setStatusMessage("Voice registration complete!");
        Toast.show({
          type: "success",
          text1: "Đăng ký giọng nói thành công",
          text2: "Chuyển đến danh sách phiên hội đồng...",
        });
        setTimeout(() => {
          navigation.replace("Dashboard");
        }, 1200);
      } catch (error: any) {
        console.error("Voice registration upload failed", error);
        setRecordingState("error");
        setStatusMessage(error.message || "Upload failed. Please try again.");
        Toast.show({
          type: "error",
          text1: "Registration failed",
          text2: error.message || "Please try again",
        });
        setSamples([]);
      }
    },
    [navigation, prompts, token, totalSamples, user]
  );

  useEffect(() => {
    if (!user) {
      navigation.replace("Login");
    }
  }, [user, navigation]);

  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => null);
      }
    };
  }, [recording]);

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

      <View style={styles.stepIndicator}>
        {Array.from({ length: totalSamples }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.stepDot,
              index === samples.length && styles.stepDotActive,
              index < samples.length && styles.stepDotCompleted,
            ]}
          />
        ))}
      </View>

      <View style={styles.promptCard}>
        <View style={styles.promptHeader}>
          <MaterialIcons name="volume-up" size={20} color="#4f46e5" />
          <Text style={styles.promptHeaderText}>Please read this phrase clearly:</Text>
        </View>
        <Text style={styles.promptText}>"{currentPrompt}"</Text>
      </View>

      <View style={styles.card}>
        <TouchableOpacity
          style={[
            styles.microphoneButton,
            recordingState === "recording" && styles.microphoneButtonActive,
          ]}
          onPress={handleMicrophonePress}
          activeOpacity={0.85}
        >
          {recordingState === "processing" ? (
            <ActivityIndicator size="large" color="#ffffff" />
          ) : (
            <MaterialIcons name="mic" size={48} color="#ffffff" />
          )}
        </TouchableOpacity>
        <Text style={styles.cardTitle}>Tap the microphone to record</Text>
        <Text style={styles.cardSubtitle}>
          Recording {currentSampleNumber} of {totalSamples}
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
          <Text style={styles.tipText}>Read the phrase clearly and naturally</Text>
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
  stepDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#e2e8f0",
  },
  stepDotActive: {
    backgroundColor: "#4f46e5",
  },
  stepDotCompleted: {
    backgroundColor: "#7c3aed",
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

