import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import Toast from "react-native-toast-message";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, globalStyles } from "../utils/styles";
import { voiceService } from "../services/voiceService";
import { useAuth } from "../context/AuthContext";
import { RootStackParamList } from "../navigation/AppNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type RecordingState = "idle" | "recording" | "processing" | "verified" | "error";

export const VoiceAuthScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { token, user } = useAuth();

  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    "Tap the microphone and speak naturally"
  );

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
    setStatusMessage("Processing your voice sample...");

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      if (!uri) {
        throw new Error("No audio file found");
      }

      if (!user?.id) {
        throw new Error("Không tìm thấy thông tin người dùng");
      }

      const result = await voiceService.verifyVoiceSample(uri, user.id, token);

      if (result.success) {
        setRecordingState("verified");
        setStatusMessage("Voice verified! Redirecting...");
        Toast.show({
          type: "success",
          text1: "Voice authenticated",
          text2: "Welcome back!",
        });
        setTimeout(() => {
          navigation.replace("Dashboard");
        }, 1200);
      } else {
        throw new Error(result.message || "Voice not recognized");
      }
    } catch (error: any) {
      console.error("Voice verification failed", error);
      setRecordingState("error");
      setStatusMessage(error.message || "Voice verification failed");
      Toast.show({
        type: "error",
        text1: "Voice verification failed",
        text2: error.message || "Please try again",
      });
      resetRecording();
    }
  };

  const handleMicrophonePress = () => {
    if (recordingState === "recording") {
      stopRecording();
    } else if (recordingState === "idle" || recordingState === "error") {
      startRecording();
    }
  };

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
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <MaterialIcons name="shield" size={36} color="#ffffff" />
        </View>
        <Text style={styles.heroTitle}>Voice Authentication</Text>
        <Text style={styles.heroSubtitle}>
          Speak naturally to authenticate your identity
        </Text>
      </View>

      <View style={styles.card}>
        <TouchableOpacity
          style={[
            styles.microphoneButton,
            recordingState === "recording" && styles.microphoneButtonActive,
          ]}
          onPress={handleMicrophonePress}
          activeOpacity={0.8}
        >
          {recordingState === "processing" ? (
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
          <MaterialIcons name="info" size={20} color="#4f46e5" />
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
          <Text style={styles.tipText}>Say a few words naturally when prompted</Text>
        </View>
      </View>
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

