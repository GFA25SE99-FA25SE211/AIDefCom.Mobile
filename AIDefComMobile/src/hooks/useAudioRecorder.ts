import { useState, useRef, useCallback, useEffect } from "react";
import { Audio } from "expo-av";
import { Platform } from "react-native";
import LiveAudioStream from "react-native-live-audio-stream";
import * as FileSystem from "expo-file-system/legacy";

interface UseAudioRecorderProps {
  wsUrl: string;
  onWsEvent?: (msg: any) => void;
  autoConnect?: boolean;
}

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export const useAudioRecorder = ({
  wsUrl,
  onWsEvent,
  autoConnect = false,
}: UseAudioRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const onWsEventRef = useRef(onWsEvent);
  const isConnectingRef = useRef(false);
  const streamingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentBytesRef = useRef<number>(0);
  const audioBufferRef = useRef<Uint8Array>(new Uint8Array(0));
  const isRecordingRef = useRef<boolean>(false); // Track recording state with ref for callbacks
  const liveAudioStreamInitialized = useRef<boolean>(false);

  useEffect(() => {
    onWsEventRef.current = onWsEvent;
  }, [onWsEvent]);

  const connectWs = useCallback(() => {
    if (isConnectingRef.current) return;
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (!wsUrl) {
      console.warn("⚠️ WebSocket URL is empty");
      return;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {
      }
      wsRef.current = null;
    }

    isConnectingRef.current = true;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("✅ WebSocket connected:", wsUrl);
        setWsConnected(true);
        isConnectingRef.current = false;
        onWsEventRef.current?.({
          type: "connected",
          event: "connected",
        });
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          onWsEventRef.current?.(msg);
        } catch (err) {
          console.log("WS raw message:", evt.data);
          if (typeof evt.data === "string") {
            onWsEventRef.current?.({
              type: "message",
              data: evt.data,
            });
          }
        }
      };

      ws.onerror = (e) => {
        let errorMessage = "Unknown WebSocket error";
        try {
          if (e && typeof e === "object") {
            errorMessage = (e as any)?.message || (e as any)?.type || String(e);
          } else if (e) {
            errorMessage = String(e);
          }
        } catch (err) {
          errorMessage = "WebSocket connection error";
        }

        console.error("❌ WebSocket error:", errorMessage);
        setWsConnected(false);
        isConnectingRef.current = false;

        try {
          onWsEventRef.current?.({
            type: "error",
            event: "error",
            message: errorMessage,
          });
        } catch (err) {
          console.warn("Failed to notify parent of WebSocket error");
        }
      };

      ws.onclose = (event) => {
        console.log("🔌 WebSocket closed", event.code, event.reason);
        setWsConnected(false);
        isConnectingRef.current = false;
        wsRef.current = null;

        onWsEventRef.current?.({
          type: "closed",
          event: "closed",
          code: event.code,
          reason: event.reason,
        });
      };
    } catch (error: any) {
      console.error("❌ Failed to create WebSocket:", error?.message || error);
      setWsConnected(false);
      isConnectingRef.current = false;
      wsRef.current = null;

      onWsEventRef.current?.({
        type: "error",
        event: "error",
        message: error?.message || "Failed to create WebSocket connection",
      });
    }
  }, [wsUrl]);

  useEffect(() => {
    if (autoConnect && wsUrl) {
      const timer = setTimeout(() => {
        connectWs();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoConnect, wsUrl, connectWs]);

  useEffect(() => {
    return () => {
      if (streamingIntervalRef.current) {
        clearInterval(streamingIntervalRef.current);
        streamingIntervalRef.current = null;
      }

      // Cleanup Android LiveAudioStream
      if (Platform.OS === "android" && isRecordingRef.current) {
        try {
          LiveAudioStream.stop();
        } catch (e) {}
      }

      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
      
      isRecordingRef.current = false;
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connectWs();
      await new Promise((resolve) => {
        const check = () => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)
            resolve(null);
          else setTimeout(check, 50);
        };
        check();
      });
    }

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error("Microphone permission not granted");
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      // Android: Use LiveAudioStream for real-time streaming (works in APK build)
      if (Platform.OS === "android") {
        console.log("🎙️ Starting Android recording with LiveAudioStream...");
        
        if (!liveAudioStreamInitialized.current) {
          LiveAudioStream.init({
            sampleRate: SAMPLE_RATE,
            channels: CHANNELS,
            bitsPerSample: BITS_PER_SAMPLE,
            audioSource: 6, // VOICE_RECOGNITION
            bufferSize: 4096,
            wavFile: "", // Empty string means we handle audio ourselves
          } as any);
          liveAudioStreamInitialized.current = true;
        }

        LiveAudioStream.on("data", (base64Data: string) => {
          if (!isRecordingRef.current) return;
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          
          try {
            const audioChunk = base64ToUint8Array(base64Data);
            if (audioChunk.length > 0) {
              // Send raw PCM data directly to WebSocket
              const CHUNK_SIZE = 640;
              for (let i = 0; i < audioChunk.length; i += CHUNK_SIZE) {
                const chunk = audioChunk.slice(i, Math.min(i + CHUNK_SIZE, audioChunk.length));
                if (chunk.length > 0 && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send(chunk.buffer);
                }
              }
              console.log(`📤 [Android] Sent ${audioChunk.length} bytes`);
            }
          } catch (err) {
            console.warn("Audio streaming error:", err);
          }
        });

        LiveAudioStream.start();
        setIsRecording(true);
        isRecordingRef.current = true;
        console.log("🎤 Android recording started with LiveAudioStream");
        return;
      }

      // iOS: Use expo-av Recording
      const recordingOptions = {
        android: {
          extension: ".wav",
          outputFormat: Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate: SAMPLE_RATE,
          numberOfChannels: CHANNELS,
          bitRate: 128000,
        },
        ios: {
          extension: ".wav",
          outputFormat: Audio.IOSOutputFormat.LINEARPCM,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: SAMPLE_RATE,
          numberOfChannels: CHANNELS,
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

      lastSentBytesRef.current = 0;
      audioBufferRef.current = new Uint8Array(0);

      streamingIntervalRef.current = setInterval(async () => {
        if (
          !recordingRef.current ||
          !wsRef.current ||
          wsRef.current.readyState !== WebSocket.OPEN
        ) {
          return;
        }

        try {
          const uri = recordingRef.current.getURI();
          if (!uri) return;

          const base64Data = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });

          if (!base64Data) return;

          const currentAudioBytes = base64ToUint8Array(base64Data);
          const currentLength = currentAudioBytes.length;

          if (currentLength > lastSentBytesRef.current) {
            const newAudioChunk = currentAudioBytes.slice(
              lastSentBytesRef.current
            );

            if (newAudioChunk.length >= 640) {
              if (
                wsRef.current &&
                wsRef.current.readyState === WebSocket.OPEN
              ) {
                const CHUNK_SIZE = 640;
                for (let i = 0; i < newAudioChunk.length; i += CHUNK_SIZE) {
                  const chunk = newAudioChunk.slice(
                    i,
                    Math.min(i + CHUNK_SIZE, newAudioChunk.length)
                  );
                  if (chunk.length >= CHUNK_SIZE) {
                    wsRef.current.send(chunk.buffer);
                  }
                }

                console.log(
                  `📤 [iOS] Sent ${newAudioChunk.length} bytes (from ${lastSentBytesRef.current} to ${currentLength})`
                );
                lastSentBytesRef.current = currentLength;
              }
            }
          }
        } catch (err) {
          console.warn("Audio streaming error:", err);
        }
      }, 300);

      setIsRecording(true);
      isRecordingRef.current = true;
      console.log("🎤 iOS recording started with audio streaming");
    } catch (error: any) {
      console.error("❌ Failed to start recording:", error);
      throw error;
    }
  }, [connectWs]);

  const stopRecording = useCallback(async () => {
    try {
      // Android: Stop LiveAudioStream
      if (Platform.OS === "android") {
        if (!isRecordingRef.current) {
          console.log("⚠️ stopRecording called but not recording (Android)");
          return;
        }
        
        try {
          LiveAudioStream.stop();
        } catch (err) {
          console.warn("Error stopping LiveAudioStream:", err);
        }
        
        setIsRecording(false);
        isRecordingRef.current = false;
        console.log("🛑 Android recording stopped");
        return;
      }

      // iOS: Stop expo-av Recording
      if (streamingIntervalRef.current) {
        clearInterval(streamingIntervalRef.current);
        streamingIntervalRef.current = null;
      }

      if (recordingRef.current) {
        const uri = recordingRef.current.getURI();

        await recordingRef.current.stopAndUnloadAsync();

        if (
          uri &&
          wsRef.current &&
          wsRef.current.readyState === WebSocket.OPEN
        ) {
          try {
            const base64Data = await FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            });

            if (base64Data) {
              const currentAudioBytes = base64ToUint8Array(base64Data);
              const currentLength = currentAudioBytes.length;

              if (currentLength > lastSentBytesRef.current) {
                const remainingChunk = currentAudioBytes.slice(
                  lastSentBytesRef.current
                );
                if (remainingChunk.length > 0) {
                  wsRef.current.send(remainingChunk.buffer);
                  console.log(
                    `📤 [iOS] Sent final audio chunk: ${remainingChunk.length} bytes`
                  );
                }
              }
            }
          } catch (err) {
            console.warn("Error sending final audio chunk:", err);
          }
        }

        recordingRef.current = null;
      }

      lastSentBytesRef.current = 0;
      audioBufferRef.current = new Uint8Array(0);

      setIsRecording(false);
      isRecordingRef.current = false;
      console.log("🛑 iOS recording stopped (WebSocket still open)");
    } catch (error) {
      console.error("Error stopping recording:", error);
    }
  }, []);

  const toggleAsk = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn("⚠️ WebSocket not open");
      return;
    }
    if (!isAsking) {
      wsRef.current.send("q:start");
      setIsAsking(true);
    } else {
      wsRef.current.send("q:end");
      setIsAsking(false);
    }
  }, [isAsking]);

  const stopSession = useCallback(() => {
    console.log("🛑 Ending session and closing WebSocket...");
    if (isRecording) {
      stopRecording();
    }
    setIsAsking(false);

    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send("stop");
      }
    } catch (e) {
      console.warn("Error sending stop command:", e);
    }

    try {
      if (wsRef.current) {
        wsRef.current.close(1000, "Session ended by user");
        wsRef.current = null;
      }
    } catch (e) {
      console.warn("Error closing WebSocket:", e);
    }
  }, [isRecording, stopRecording]);

  const broadcastQuestionStarted = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send("question:started");
      console.log("📢 Sent question:started");
    }
  }, []);

  const broadcastQuestionProcessing = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send("question:processing");
      console.log("📢 Sent question:processing");
    }
  }, []);

  const broadcastSessionStart = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send("session:start");
      console.log("📢 Sent session:start");
    }
  }, []);

  const broadcastSessionEnd = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send("session:end");
      console.log("📢 Sent session:end");
    }
  }, []);

  const broadcastMicDisabled = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send("mic:disabled");
      console.log("📢 Sent mic:disabled");
    }
  }, []);

  const broadcastSpeakerStarted = useCallback((userId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "speaker:started",
          userId: userId,
        })
      );
      console.log("📢 Sent speaker:started for userId:", userId);
    }
  }, []);

  const broadcastSpeakerStopped = useCallback((userId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "speaker:stopped",
          userId: userId,
        })
      );
      console.log("📢 Sent speaker:stopped for userId:", userId);
    }
  }, []);

  return {
    isRecording,
    isAsking,
    wsConnected,
    startRecording,
    stopRecording,
    toggleAsk,
    stopSession,
    broadcastSessionStart,
    broadcastSessionEnd,
    broadcastQuestionStarted,
    broadcastQuestionProcessing,
    broadcastMicDisabled,
    broadcastSpeakerStarted,
    broadcastSpeakerStopped,
  };
};
