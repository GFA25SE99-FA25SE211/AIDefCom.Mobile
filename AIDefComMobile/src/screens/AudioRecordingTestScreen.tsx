import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
  Linking,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import Toast from "react-native-toast-message";
import { colors } from "../utils/styles";

const RECORDING_DURATION = 5; // 5 seconds for testing
const SAMPLE_RATE = 16000;

export const AudioRecordingTestScreen = () => {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [recordingInfo, setRecordingInfo] = useState<any>(null);
  const [countdown, setCountdown] = useState(RECORDING_DURATION);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const resetTest = () => {
    setRecording(null);
    setIsRecording(false);
    setRecordingUri(null);
    setRecordingInfo(null);
    setCountdown(RECORDING_DURATION);
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      resetTest();

      console.log("🔐 Requesting microphone permissions...");
      const permission = await Audio.requestPermissionsAsync();
      
      console.log("📋 Permission status:", {
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
        status: permission.status,
      });

      if (!permission.granted) {
        Alert.alert(
          "Quyền truy cập microphone bị từ chối",
          "Vui lòng cấp quyền microphone để test recording.",
          [
            { text: "Hủy", style: "cancel" },
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
        throw new Error("Recording không khởi động được");
      }

      if (!status.canRecord) {
        throw new Error("Microphone không sẵn sàng");
      }

      setRecording(newRecording);
      setIsRecording(true);
      setCountdown(RECORDING_DURATION);

      // Start countdown
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          const newValue = prev - 1;
          if (newValue <= 0) {
            if (countdownRef.current) {
              clearInterval(countdownRef.current);
              countdownRef.current = null;
            }
            stopRecording();
            return 0;
          }
          return newValue;
        });
      }, 1000);

      // Monitor recording status
      newRecording.setOnRecordingStatusUpdate((status) => {
        console.log(`📊 Recording: ${status.durationMillis}ms`);
        if (!status.isRecording && isRecording) {
          console.warn("⚠️ Recording stopped unexpectedly");
        }
      });

      Toast.show({
        type: "success",
        text1: "Bắt đầu ghi âm",
        text2: `Ghi âm trong ${RECORDING_DURATION} giây...`,
      });
    } catch (error: any) {
      console.error("❌ Failed to start recording:", error);
      Alert.alert("Lỗi", error.message || "Không thể bắt đầu ghi âm");
      resetTest();
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }

      setIsRecording(false);

      const status = await recording.getStatusAsync();
      console.log("📊 Final status:", status);

      if (status.isRecording) {
        await recording.stopAndUnloadAsync();
      }

      const uri = recording.getURI();
      console.log("🎵 Recording URI:", uri);

      if (!uri) {
        throw new Error("Không tìm thấy file ghi âm");
      }

      // Get file info
      try {
        const response = await fetch(uri);
        const blob = await response.blob();
        const fileSize = blob.size;
        const durationSeconds = status.durationMillis
          ? status.durationMillis / 1000
          : 0;

        const info = {
          uri,
          duration: durationSeconds,
          durationMillis: status.durationMillis,
          fileSize,
          fileSizeKB: (fileSize / 1024).toFixed(2),
          fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2),
          sampleRate: SAMPLE_RATE,
          format: "WAV",
          channels: 1,
        };

        setRecordingInfo(info);
        setRecordingUri(uri);

        console.log("📦 File info:", info);

        Toast.show({
          type: "success",
          text1: "Ghi âm thành công",
          text2: `Thời lượng: ${durationSeconds.toFixed(1)}s, Kích thước: ${info.fileSizeKB}KB`,
        });
      } catch (fetchError) {
        console.error("Error fetching file:", fetchError);
        Alert.alert("Lỗi", "Không thể đọc thông tin file");
      }
    } catch (error: any) {
      console.error("❌ Failed to stop recording:", error);
      Alert.alert("Lỗi", error.message || "Không thể dừng ghi âm");
    }
  };

  const playRecording = async () => {
    if (!recordingUri) return;

    try {
      console.log("▶️ Playing recording:", recordingUri);
      const { sound } = await Audio.Sound.createAsync({ uri: recordingUri });
      await sound.playAsync();

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          sound.unloadAsync();
        }
      });

      Toast.show({
        type: "info",
        text1: "Đang phát",
        text2: "Nhấn để dừng",
      });
    } catch (error: any) {
      console.error("❌ Failed to play:", error);
      Alert.alert("Lỗi", "Không thể phát file ghi âm");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <MaterialIcons name="mic" size={48} color="#4f46e5" />
        <Text style={styles.title}>Audio Recording Test</Text>
        <Text style={styles.subtitle}>
          Test microphone và file ghi âm
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Trạng thái</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Recording:</Text>
          <Text
            style={[
              styles.statusValue,
              isRecording ? styles.statusActive : styles.statusInactive,
            ]}
          >
            {isRecording ? "Đang ghi" : "Dừng"}
          </Text>
        </View>

        {isRecording && (
          <View style={styles.countdownContainer}>
            <Text style={styles.countdownText}>{countdown}s</Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.button,
            isRecording ? styles.buttonStop : styles.buttonStart,
          ]}
          onPress={isRecording ? stopRecording : startRecording}
        >
          <MaterialIcons
            name={isRecording ? "stop" : "mic"}
            size={24}
            color="#ffffff"
          />
          <Text style={styles.buttonText}>
            {isRecording ? "Dừng ghi âm" : "Bắt đầu ghi âm"}
          </Text>
        </TouchableOpacity>
      </View>

      {recordingInfo && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Thông tin file</Text>
          <View style={styles.infoContainer}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>URI:</Text>
              <Text style={styles.infoValue} numberOfLines={2}>
                {recordingInfo.uri}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Thời lượng:</Text>
              <Text style={styles.infoValue}>
                {recordingInfo.duration.toFixed(2)}s (
                {recordingInfo.durationMillis}ms)
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Kích thước:</Text>
              <Text style={styles.infoValue}>
                {recordingInfo.fileSizeKB} KB ({recordingInfo.fileSizeMB} MB)
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Sample Rate:</Text>
              <Text style={styles.infoValue}>{recordingInfo.sampleRate} Hz</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Format:</Text>
              <Text style={styles.infoValue}>{recordingInfo.format}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Channels:</Text>
              <Text style={styles.infoValue}>{recordingInfo.channels}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, styles.buttonPlay]}
            onPress={playRecording}
          >
            <MaterialIcons name="play-arrow" size={24} color="#ffffff" />
            <Text style={styles.buttonText}>Phát lại</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonReset]}
            onPress={resetTest}
          >
            <MaterialIcons name="refresh" size={24} color="#ffffff" />
            <Text style={styles.buttonText}>Reset</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Hướng dẫn</Text>
        <Text style={styles.instructionText}>
          1. Nhấn "Bắt đầu ghi âm" để test{'\n'}
          2. Nói vào microphone trong {RECORDING_DURATION} giây{'\n'}
          3. Kiểm tra thông tin file sau khi ghi xong{'\n'}
          4. Phát lại để nghe thử{'\n'}
          5. Kiểm tra console logs để debug
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    alignItems: "center",
    marginTop: 40,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  statusLabel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  statusValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  statusActive: {
    color: "#10b981",
  },
  statusInactive: {
    color: "#6b7280",
  },
  countdownContainer: {
    alignItems: "center",
    marginVertical: 16,
  },
  countdownText: {
    fontSize: 48,
    fontWeight: "700",
    color: "#4f46e5",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 12,
  },
  buttonStart: {
    backgroundColor: "#10b981",
  },
  buttonStop: {
    backgroundColor: "#ef4444",
  },
  buttonPlay: {
    backgroundColor: "#4f46e5",
  },
  buttonReset: {
    backgroundColor: "#6b7280",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  infoContainer: {
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 12,
    alignItems: "flex-start",
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    width: 100,
  },
  infoValue: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  instructionText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 24,
  },
});

