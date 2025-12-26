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
import LiveAudioStream from "react-native-live-audio-stream";
import * as FileSystem from "expo-file-system/legacy";
import Toast from "react-native-toast-message";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, globalStyles } from "../utils/styles";
import { VOICE_AUTH_CONFIG } from "../utils/constants";
import { voiceService } from "../services/voiceService";
import { useAuth } from "../context/AuthContext";
import { RootStackParamList } from "../navigation/AppNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const RECORDING_DURATION = 15;
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

// WAV Helper functions
const createWavHeader = (dataLength: number): Uint8Array => {
  const byteRate = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
  const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  return new Uint8Array(buffer);
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

type SampleStatus =
  | "pending"
  | "recording"
  | "processing"
  | "completed"
  | "failed";

interface SampleInfo {
  status: SampleStatus;
  index: number;
  uri?: string;
}

export const VoiceRegistrationScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { token, user } = useAuth();
  const totalSamples = VOICE_AUTH_CONFIG.REQUIRED_SAMPLES;
  const prompts = VOICE_AUTH_CONFIG.PROMPTS;

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [currentSampleIndex, setCurrentSampleIndex] = useState(0);
  // Initialize samples directly instead of in useEffect to avoid race conditions
  const [samples, setSamples] = useState<SampleInfo[]>(() =>
    Array.from({ length: totalSamples }, (_, i) => ({
      status: "pending" as const,
      index: i,
    }))
  );
  const [countdown, setCountdown] = useState(RECORDING_DURATION);
  const [statusMessage, setStatusMessage] = useState(
    "Press button to start recording sample 1"
  );
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const progressAnimation = useRef(new Animated.Value(0)).current;

  // For Android WAV recording using LiveAudioStream
  const audioDataRef = useRef<Uint8Array[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false); // Track recording state with ref for callbacks

  useEffect(() => {
    const checkEnrollmentStatus = async () => {
      try {
        if (!user?.id) {
          return;
        }

        setStatusMessage("Checking enrollment status...");

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
              5000
            )
          ),
        ]);

        const enrollmentCount = status.enrollment_count ?? 0;
        const minRequired =
          status.min_required ?? VOICE_AUTH_CONFIG.REQUIRED_SAMPLES;
        const isComplete =
          status.is_complete ||
          status.enrollment_status === "enrolled" ||
          enrollmentCount >= minRequired;

        console.log("📊 Enrollment status:", {
          enrollmentCount,
          minRequired,
          isComplete,
        });

        // If already completed, redirect to VoiceAuth
        if (isComplete) {
          Toast.show({
            type: "info",
            text1: "Voice already registered",
            text2: "Redirecting to authentication...",
          });
          setTimeout(() => {
            navigation.replace("VoiceAuth");
          }, 1000);
          return;
        }

        // If partially enrolled, update samples to reflect current state
        if (enrollmentCount > 0) {
          setSamples((prev) => {
            const updated = [...prev];
            // Mark first N samples as completed
            for (let i = 0; i < enrollmentCount && i < updated.length; i++) {
              updated[i] = {
                ...updated[i],
                status: "completed",
              };
            }
            return updated;
          });

          // Set current index to the next pending sample
          setCurrentSampleIndex(enrollmentCount);

          const remaining = minRequired - enrollmentCount;
          setStatusMessage(
            `Already have ${enrollmentCount}/${minRequired} samples. Need ${remaining} more. Press button to continue.`
          );

          Toast.show({
            type: "info",
            text1: `${enrollmentCount} samples already registered`,
            text2: `Need ${remaining} more sample(s)`,
          });
        } else {
          setStatusMessage("Press button to start recording sample 1");
        }
      } catch (error: any) {
        console.error("Failed to check enrollment status:", error);
        setStatusMessage("Press button to start recording sample 1");
      }
    };

    checkEnrollmentStatus();
  }, [navigation, token, user?.id]);

  useEffect(() => {
    const completedCount = samples.filter(
      (s) => s.status === "completed"
    ).length;
    Animated.timing(progressAnimation, {
      toValue: completedCount / totalSamples,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [samples, totalSamples]);

  const getPromptForIndex = (index: number) => {
    const raw =
      prompts[Math.min(index, prompts.length - 1)] || prompts[0] || "";
    const emailName =
      user?.email && user.email.includes("@")
        ? user.email.split("@")[0]
        : undefined;
    const displayName = user?.fullName || emailName || "me";
    return raw.replace("{Speaker Name}", displayName);
  };

  const currentPrompt = getPromptForIndex(currentSampleIndex);
  const completedCount = samples.filter((s) => s.status === "completed").length;

  const handleRecordingError = (error: any) => {
    const errorMessage = error.message || "";
    const isMaxEnrollmentReached = errorMessage.includes(
      "Maximum enrollment limit"
    );

    if (errorMessage.includes("VOICE_NOT_UNIQUE") || errorMessage.includes("Voice is too similar")) {
      setStatusMessage("Voice similarity error: this voice is too similar to another user. Please record again with your natural voice.");
      Toast.show({
        type: "error",
        position: "top",
        text1: "Voice Conflict",
        text2: "Your voice is too similar to another user. Please try again with your natural voice.",
      });
      return;
    }

    if (isMaxEnrollmentReached) {
      console.log("✅ User already has 3 samples - redirecting to VoiceAuth");
      setStatusMessage(
        "Already have 3 voice samples. Redirecting to authentication..."
      );
      Toast.show({
        type: "info",
        position: "top",
        text1: "Enough voice samples",
        text2: "Redirecting to voice authentication page",
      });
      setTimeout(() => {
        navigation.replace("VoiceAuth");
      }, 1500);
      resetRecording();
      return;
    }

    setStatusMessage(error.message || "Upload failed. Please try again.");
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
      text1: "Error",
      text2: error.message || "Failed to process recording",
    });
    resetRecording();
  };

  const resetRecording = () => {
    setRecording(null);
    recordingRef.current = null;
    setIsRecording(false);
    isRecordingRef.current = false;
    setCountdown(RECORDING_DURATION);
    audioDataRef.current = [];
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
        let message = "Microphone access permission denied.";
        let showSettingsButton = false;

        if (Platform.OS === "ios") {
          if (!permission.canAskAgain) {
            message +=
              "\n\nPlease go to Settings → AIDefComMobile → Microphone to enable permission.";
            showSettingsButton = true;
          } else {
            message += "\n\nPlease grant microphone permission to continue.";
          }
        }

        Alert.alert("Microphone access permission denied", message, [
          { text: "Cancel", style: "cancel" },
          ...(showSettingsButton
            ? [
                {
                  text: "Open Settings",
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
        ]);
        return;
      }

      console.log("✅ Permission granted, setting up audio...");

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
      console.log("🔧 Audio mode configured");

      // Android: Use LiveAudioStream to capture raw PCM and create WAV
      // iOS: Use expo-av which creates WAV properly
      if (Platform.OS === "android") {
        console.log(
          "🎙️ Starting Android WAV recording with LiveAudioStream..."
        );

        audioDataRef.current = [];
        recordingStartTimeRef.current = Date.now();

        LiveAudioStream.init({
          sampleRate: SAMPLE_RATE,
          channels: CHANNELS,
          bitsPerSample: BITS_PER_SAMPLE,
          audioSource: 6, // VOICE_RECOGNITION
          bufferSize: 4096,
          wavFile: "", // Empty string means we handle WAV creation ourselves
        } as any);

        LiveAudioStream.on("data", (base64Data: string) => {
          const audioChunk = base64ToUint8Array(base64Data);
          audioDataRef.current.push(audioChunk);
        });

        LiveAudioStream.start();
        setIsRecording(true);
        isRecordingRef.current = true;
        setCountdown(RECORDING_DURATION);
        setStatusMessage(`Recording sample ${currentSampleIndex + 1}...`);

        setSamples((prev) => {
          const updated = [...prev];
          updated[currentSampleIndex] = {
            ...updated[currentSampleIndex],
            status: "recording",
          };
          return updated;
        });

        // Use a separate timer for auto-stop to avoid closure issues
        const autoStopTimeout = setTimeout(() => {
          console.log("⏰ Auto-stop timer fired, stopping recording...");
          if (isRecordingRef.current) {
            stopRecording();
          }
        }, RECORDING_DURATION * 1000);

        countdownRef.current = setInterval(() => {
          setCountdown((prev) => {
            const newValue = prev - 1;
            if (newValue <= 0) {
              if (countdownRef.current) {
                clearInterval(countdownRef.current);
                countdownRef.current = null;
              }
              return 0;
            }
            return newValue;
          });
        }, 1000);

        Toast.show({
          type: "info",
          text1: "Recording",
          text2: `Sample ${currentSampleIndex + 1}/${totalSamples}`,
        });

        console.log("🎤 Android WAV Recording started");
        return;
      }

      // iOS: Use expo-av with LINEARPCM for WAV
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

      console.log("🎙️ Creating iOS recording...");
      const { recording: newRecording } = await Audio.Recording.createAsync(
        recordingOptions
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      const status = await newRecording.getStatusAsync();
      console.log("📊 Initial status:", status);

      if (!status.isRecording) {
        throw new Error("Recording could not start. Please check microphone.");
      }

      if (!status.canRecord) {
        throw new Error("Microphone is not ready for recording.");
      }

      setRecording(newRecording);
      recordingRef.current = newRecording;
      setIsRecording(true);
      setCountdown(RECORDING_DURATION);
      setStatusMessage(`Recording sample ${currentSampleIndex + 1}...`);

      setSamples((prev) => {
        const updated = [...prev];
        updated[currentSampleIndex] = {
          ...updated[currentSampleIndex],
          status: "recording",
        };
        return updated;
      });

      recordingRef.current = newRecording;

      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          const newValue = prev - 1;
          if (newValue <= 0) {
            if (countdownRef.current) {
              clearInterval(countdownRef.current);
              countdownRef.current = null;
            }
            console.log("⏰ Countdown reached 0, auto-stopping recording...");
            setTimeout(() => {
              const currentRec = recordingRef.current;
              if (currentRec) {
                stopRecording();
              }
            }, 50);
            return 0;
          }
          return newValue;
        });
      }, 1000);

      newRecording.setOnRecordingStatusUpdate((status) => {
        if (!status.isRecording && isRecording) {
          console.warn("⚠️ Recording stopped unexpectedly");
        }
      });

      Toast.show({
        type: "info",
        text1: "Recording",
        text2: `Sample ${currentSampleIndex + 1}/${totalSamples}`,
      });
    } catch (error: any) {
      console.error("❌ Failed to start recording:", error);
      Alert.alert("Error", error.message || "Cannot start recording");
      resetRecording();
    }
  };

  const stopRecording = async () => {
    // For Android using LiveAudioStream
    if (Platform.OS === "android") {
      if (!isRecording && !isRecordingRef.current) {
        console.log("⚠️ stopRecording called but not recording");
        return;
      }

      if (samples[currentSampleIndex]?.status === "processing") {
        console.log("⚠️ Already processing, cannot stop");
        return;
      }

      try {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }

        setIsRecording(false);
        isRecordingRef.current = false;
        setCountdown(0);
        setStatusMessage(`Processing audio...`);

        setSamples((prev) => {
          const updated = [...prev];
          updated[currentSampleIndex] = {
            ...updated[currentSampleIndex],
            status: "processing",
          };
          return updated;
        });

        // Stop LiveAudioStream
        LiveAudioStream.stop();
        console.log("🛑 LiveAudioStream stopped");

        // Calculate total data length
        let totalLength = 0;
        for (const chunk of audioDataRef.current) {
          totalLength += chunk.length;
        }

        if (totalLength === 0) {
          throw new Error("No audio data captured. Please try again.");
        }

        const durationSeconds =
          (Date.now() - recordingStartTimeRef.current) / 1000;
        console.log(
          `📊 Captured ${totalLength} bytes, duration: ${durationSeconds.toFixed(
            1
          )}s`
        );

        if (durationSeconds < 10) {
          throw new Error(
            `Recording too short (${durationSeconds.toFixed(
              1
            )}s). Please record at least 10 seconds.`
          );
        }

        setStatusMessage(`Creating WAV file...`);

        // Combine all chunks
        const combinedData = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of audioDataRef.current) {
          combinedData.set(chunk, offset);
          offset += chunk.length;
        }

        // Create WAV file with header
        const wavHeader = createWavHeader(totalLength);
        const wavFile = new Uint8Array(wavHeader.length + combinedData.length);
        wavFile.set(wavHeader, 0);
        wavFile.set(combinedData, wavHeader.length);

        // Convert to base64 and save
        const wavBase64 = uint8ArrayToBase64(wavFile);
        const wavUri = `${
          FileSystem.cacheDirectory
        }voice-sample-${Date.now()}.wav`;

        await FileSystem.writeAsStringAsync(wavUri, wavBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Verify file
        const fileInfo = await FileSystem.getInfoAsync(wavUri);
        console.log("✅ WAV file created:", {
          uri: wavUri,
          size: (fileInfo as any).size,
        });

        // Clear audio data
        audioDataRef.current = [];

        if (!user?.id) {
          throw new Error("User information not found");
        }

        setStatusMessage(
          `Uploading sample ${currentSampleIndex + 1} to server...`
        );
        console.log("📤 Uploading WAV sample to server...");

        const response = await voiceService.registerVoiceSample({
          audioUri: wavUri,
          userId: user.id,
          token,
        });

        if (response.error) {
          throw new Error(response.error);
        }

        const enrollmentCount = Number(
          response.enrollment_count ?? response.enrollmentCount ?? 0
        );
        const isComplete = response.is_complete ?? response.completed ?? false;
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
            uri: wavUri,
          };
          nextSampleIndex = updated.findIndex(
            (s) => s.status === "pending" || s.status === "failed"
          );
          return updated;
        });

        setStatusMessage(
          `Sample ${currentSampleIndex + 1} saved successfully.`
        );
        resetRecording();
        Toast.show({
          type: "success",
          position: "top",
          text1: `Sample ${currentSampleIndex + 1} saved`,
          text2: `Recorded ${enrollmentCount}/${totalSamples} samples`,
        });

        if (isComplete && enrollmentCount >= minRequired) {
          setStatusMessage("Voice registration completed!");
          Toast.show({
            type: "success",
            position: "top",
            text1: "Voice registration successful",
            text2: `Registered ${enrollmentCount} voice samples. Redirecting to dashboard...`,
          });
          setTimeout(() => {
            navigation.replace("Dashboard");
          }, 1200);
        } else if (nextSampleIndex >= 0) {
          setCurrentSampleIndex(nextSampleIndex);
          setStatusMessage(
            `Recorded ${enrollmentCount}/${totalSamples} samples. Press button to record next sample.`
          );
        }
        return;
      } catch (error: any) {
        console.error("❌ Failed to stop/upload Android recording:", error);
        handleRecordingError(error);
        return;
      }
    }

    // iOS: Use expo-av
    const currentRecording = recordingRef.current || recording;

    if (!currentRecording && !isRecording) {
      console.log("⚠️ stopRecording called but no recording");
      return;
    }

    if (samples[currentSampleIndex]?.status === "processing") {
      console.log("⚠️ Already processing, cannot stop");
      return;
    }

    try {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }

      setIsRecording(false);
      setCountdown(0);
      setStatusMessage(
        `Uploading sample ${currentSampleIndex + 1} to server...`
      );

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

      if (status.isRecording) {
        console.log("🛑 Stopping active recording...");
        await currentRecording.stopAndUnloadAsync();
        console.log("✅ Recording stopped successfully");
      } else {
        console.log("ℹ️ Recording was already stopped");
        try {
          await currentRecording.stopAndUnloadAsync();
        } catch (e) {
          console.warn("⚠️ Error unloading recording:", e);
        }
      }

      const uri = currentRecording.getURI();
      console.log("🎵 Recording URI:", uri);

      if (!uri) {
        throw new Error("Recording file not found");
      }

      const durationSeconds = status.durationMillis
        ? status.durationMillis / 1000
        : 0;

      if (durationSeconds === 0) {
        throw new Error("Recording did not capture audio. Please try again.");
      }

      if (durationSeconds < 10) {
        throw new Error(
          `Recording too short (${durationSeconds.toFixed(
            1
          )}s). Please record at least 10 seconds.`
        );
      }

      if (!user?.id) {
        throw new Error("User information not found");
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
      const isComplete = response.is_complete ?? response.completed ?? false;
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

      setStatusMessage(`Sample ${currentSampleIndex + 1} saved successfully.`);
      resetRecording();
      Toast.show({
        type: "success",
        position: "top",
        text1: `Sample ${currentSampleIndex + 1} saved`,
        text2: `Recorded ${enrollmentCount}/${totalSamples} samples`,
      });

      if (isComplete && enrollmentCount >= minRequired) {
        setStatusMessage("Voice registration completed!");
        Toast.show({
          type: "success",
          position: "top",
          text1: "Voice registration successful",
          text2: `Registered ${enrollmentCount} voice samples. Redirecting to dashboard...`,
        });
        setTimeout(() => {
          navigation.replace("Dashboard");
        }, 1200);
      } else if (nextSampleIndex >= 0) {
        setCurrentSampleIndex(nextSampleIndex);
        setStatusMessage(
          `Recorded ${enrollmentCount}/${totalSamples} samples. Press button to record next sample.`
        );
      }
    } catch (error: any) {
      console.error("❌ Failed to stop/upload recording:", error);

      const errorMessage = error.message || "";
      const isMaxEnrollmentReached = errorMessage.includes(
        "Maximum enrollment limit"
      );

      if (isMaxEnrollmentReached) {
        console.log("✅ User already has 3 samples - redirecting to VoiceAuth");
        setStatusMessage(
          "Already have 3 voice samples. Redirecting to authentication..."
        );
        Toast.show({
          type: "info",
          position: "top",
          text1: "Enough voice samples",
          text2: "Redirecting to voice authentication page",
        });
        setTimeout(() => {
          navigation.replace("VoiceAuth");
        }, 1500);
        resetRecording();
        return;
      }

      setStatusMessage(error.message || "Upload failed. Please try again.");

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
        text1: "Registration failed",
        text2: error.message || "Please try again",
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
    setStatusMessage(`Press button to re-record sample ${index + 1}`);
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
            {completedCount}/{totalSamples} samples saved
          </Text>
        </View>

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
              ? "Recording..."
              : samples[currentSampleIndex]?.status === "processing"
              ? "Processing..."
              : "Press to start recording"}
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
