import { useState, useRef, useCallback } from "react";
import { Platform } from "react-native";
import LiveAudioStream from "react-native-live-audio-stream";
import * as FileSystem from "expo-file-system";
import { Audio } from "expo-av";

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const AUDIO_SOURCE = 6; // VOICE_RECOGNITION

interface UseWavRecorderResult {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  duration: number;
}

/**
 * Creates a WAV header buffer
 */
const createWavHeader = (dataLength: number): Uint8Array => {
  const byteRate = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
  const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);
  const headerLength = 44;

  const buffer = new ArrayBuffer(headerLength);
  const view = new DataView(buffer);

  // Helper to write string
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true); // File size - 8
  writeString(8, "WAVE");

  // fmt chunk
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // Chunk size (16 for PCM)
  view.setUint16(20, 1, true); // Audio format (1 = PCM)
  view.setUint16(22, CHANNELS, true); // Number of channels
  view.setUint32(24, SAMPLE_RATE, true); // Sample rate
  view.setUint32(28, byteRate, true); // Byte rate
  view.setUint16(32, blockAlign, true); // Block align
  view.setUint16(34, BITS_PER_SAMPLE, true); // Bits per sample

  // data chunk
  writeString(36, "data");
  view.setUint32(40, dataLength, true); // Data size

  return new Uint8Array(buffer);
};

/**
 * Convert base64 to Uint8Array
 */
const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

/**
 * Convert Uint8Array to base64
 */
const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const useWavRecorder = (): UseWavRecorderResult => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const audioDataRef = useRef<Uint8Array[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = useCallback(async () => {
    try {
      // Request permission first
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error("Microphone permission not granted");
      }

      // Clear previous data
      audioDataRef.current = [];
      setDuration(0);

      // Configure LiveAudioStream
      LiveAudioStream.init({
        sampleRate: SAMPLE_RATE,
        channels: CHANNELS,
        bitsPerSample: BITS_PER_SAMPLE,
        audioSource: AUDIO_SOURCE,
        bufferSize: 4096,
      });

      // Listen for audio data
      LiveAudioStream.on("data", (base64Data: string) => {
        const audioChunk = base64ToUint8Array(base64Data);
        audioDataRef.current.push(audioChunk);
      });

      // Start recording
      LiveAudioStream.start();
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Update duration every second
      durationIntervalRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      console.log("🎤 WAV Recording started (PCM capture)");
    } catch (error) {
      console.error("❌ Failed to start WAV recording:", error);
      throw error;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    try {
      // Stop duration timer
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      // Stop recording
      LiveAudioStream.stop();
      setIsRecording(false);

      // Calculate total data length
      let totalLength = 0;
      for (const chunk of audioDataRef.current) {
        totalLength += chunk.length;
      }

      if (totalLength === 0) {
        console.warn("⚠️ No audio data captured");
        return null;
      }

      console.log(`📊 Captured ${totalLength} bytes of PCM data`);

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
      const wavUri = `${FileSystem.cacheDirectory}voice-sample-${Date.now()}.wav`;

      await FileSystem.writeAsStringAsync(wavUri, wavBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Verify file
      const fileInfo = await FileSystem.getInfoAsync(wavUri);
      console.log("✅ WAV file created:", {
        uri: wavUri,
        size: (fileInfo as any).size,
        duration: Math.floor((Date.now() - startTimeRef.current) / 1000) + "s",
      });

      // Clear data
      audioDataRef.current = [];

      return wavUri;
    } catch (error) {
      console.error("❌ Failed to stop WAV recording:", error);
      return null;
    }
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    duration,
  };
};
