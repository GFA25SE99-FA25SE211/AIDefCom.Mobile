import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

/**
 * Creates a WAV header for raw PCM data
 * @param dataLength - Length of the PCM data in bytes
 * @param sampleRate - Sample rate (e.g., 16000)
 * @param numChannels - Number of channels (1 for mono, 2 for stereo)
 * @param bitsPerSample - Bits per sample (usually 16)
 */
const createWavHeader = (
  dataLength: number,
  sampleRate: number = 16000,
  numChannels: number = 1,
  bitsPerSample: number = 16
): ArrayBuffer => {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const headerLength = 44;
  const fileLength = headerLength + dataLength;

  const buffer = new ArrayBuffer(headerLength);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, fileLength - 8, true); // File size - 8
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Chunk size
  view.setUint16(20, 1, true); // Audio format (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  return buffer;
};

const writeString = (view: DataView, offset: number, str: string): void => {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
};

/**
 * Convert audio file to WAV format by reading as base64 and adding WAV header
 * Note: This only works properly for PCM/raw audio data
 * For compressed formats like M4A/3GP, this won't produce valid WAV
 */
export const convertToWav = async (
  inputUri: string,
  sampleRate: number = 16000
): Promise<string> => {
  // On iOS, the recording should already be WAV if configured correctly
  if (Platform.OS === "ios" && inputUri.toLowerCase().endsWith(".wav")) {
    console.log("✅ iOS WAV file - no conversion needed");
    return inputUri;
  }

  // For Android or non-WAV files, we need to handle differently
  // Since we can't decode M4A/3GP without native code, we'll just pass through
  // and let the server handle it, or return error
  
  console.log("⚠️ Audio conversion not available for this format");
  console.log("📁 Original file:", inputUri);
  
  // Return original file - server needs to support multiple formats
  return inputUri;
};

/**
 * Get audio file info
 */
export const getAudioFileInfo = async (uri: string) => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return {
      exists: info.exists,
      size: info.exists ? (info as any).size : 0,
      uri: info.uri,
    };
  } catch (error) {
    console.error("Error getting audio file info:", error);
    return null;
  }
};

/**
 * Check if the file is a valid audio file based on extension
 */
export const isValidAudioFile = (uri: string): boolean => {
  const validExtensions = [".wav", ".m4a", ".3gp", ".aac", ".mp3", ".ogg"];
  const lowerUri = uri.toLowerCase();
  return validExtensions.some((ext) => lowerUri.endsWith(ext));
};

/**
 * Get the appropriate MIME type for an audio file
 */
export const getAudioMimeType = (uri: string): string => {
  const lowerUri = uri.toLowerCase();
  
  if (lowerUri.endsWith(".wav")) return "audio/wav";
  if (lowerUri.endsWith(".m4a")) return "audio/m4a";
  if (lowerUri.endsWith(".3gp")) return "audio/3gpp";
  if (lowerUri.endsWith(".aac")) return "audio/aac";
  if (lowerUri.endsWith(".mp3")) return "audio/mpeg";
  if (lowerUri.endsWith(".ogg")) return "audio/ogg";
  
  return "audio/wav"; // Default
};
