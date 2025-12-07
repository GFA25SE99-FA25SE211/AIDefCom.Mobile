import { useState, useRef, useCallback, useEffect } from "react";
import { Audio } from "expo-av";
// Sử dụng legacy API vì expo-file-system v54 đã deprecate readAsStringAsync
import * as FileSystem from "expo-file-system/legacy";

interface UseAudioRecorderProps {
  wsUrl: string; // WebSocket URL: wss://.../ws/stt?defense_session_id=XXX&role=member
  onWsEvent?: (msg: any) => void; // Event handler từ WebSocket
  autoConnect?: boolean; // Tự động kết nối WS khi load
}

// Helper: Convert base64 to Uint8Array
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
  const [isAsking, setIsAsking] = useState(false); // Chế độ câu hỏi
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const onWsEventRef = useRef(onWsEvent);
  const isConnectingRef = useRef(false);
  const streamingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentBytesRef = useRef<number>(0); // Track bytes đã gửi để chỉ gửi phần mới
  const audioBufferRef = useRef<Uint8Array>(new Uint8Array(0)); // Buffer tích lũy audio

  useEffect(() => {
    onWsEventRef.current = onWsEvent;
  }, [onWsEvent]);

  // Kết nối WebSocket
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

    // Đóng connection cũ nếu có
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {
        // Ignore errors when closing old connection
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
        // Gửi event connected cho parent
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
          // Handle non-JSON messages
          console.log("WS raw message:", evt.data);
          // Try to pass raw message if it's a string
          if (typeof evt.data === "string") {
            onWsEventRef.current?.({
              type: "message",
              data: evt.data,
            });
          }
        }
      };

      ws.onerror = (e) => {
        // React Native WebSocket error events might not be standard Error objects
        // Extract error information safely to avoid serialization issues
        let errorMessage = "Unknown WebSocket error";
        try {
          if (e && typeof e === "object") {
            errorMessage = (e as any)?.message || (e as any)?.type || String(e);
          } else if (e) {
            errorMessage = String(e);
          }
        } catch (err) {
          // If we can't extract error info, use default message
          errorMessage = "WebSocket connection error";
        }

        console.error("❌ WebSocket error:", errorMessage);
        setWsConnected(false);
        isConnectingRef.current = false;

        // Notify parent component about the error (with safe serialization)
        try {
          onWsEventRef.current?.({
            type: "error",
            event: "error",
            message: errorMessage,
          });
        } catch (err) {
          // If callback fails, just log
          console.warn("Failed to notify parent of WebSocket error");
        }
      };

      ws.onclose = (event) => {
        console.log("🔌 WebSocket closed", event.code, event.reason);
        setWsConnected(false);
        isConnectingRef.current = false;
        wsRef.current = null;

        // Notify parent about close event
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

      // Notify parent about connection failure
      onWsEventRef.current?.({
        type: "error",
        event: "error",
        message: error?.message || "Failed to create WebSocket connection",
      });
    }
  }, [wsUrl]);

  // Tự động kết nối khi autoConnect=true
  useEffect(() => {
    if (autoConnect && wsUrl) {
      const timer = setTimeout(() => {
        connectWs();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoConnect, wsUrl, connectWs]);

  // Cleanup khi unmount
  useEffect(() => {
    return () => {
      // Clear streaming interval
      if (streamingIntervalRef.current) {
        clearInterval(streamingIntervalRef.current);
        streamingIntervalRef.current = null;
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
    };
  }, []);

  const startRecording = useCallback(async () => {
    // Đảm bảo WebSocket đã kết nối
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connectWs();
      // Đợi WS mở
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
      // Request microphone permission
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error("Microphone permission not granted");
      }

      // Set audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      // Recording options - 16kHz mono PCM
      const recordingOptions = {
        android: {
          extension: ".wav",
          outputFormat: Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: ".wav",
          outputFormat: Audio.IOSOutputFormat.LINEARPCM,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 16000,
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

      // Reset tracking variables for streaming
      lastSentBytesRef.current = 0;
      audioBufferRef.current = new Uint8Array(0);

      // Start streaming audio chunks every 300ms
      // Approach: đọc toàn bộ file, so sánh với buffer đã gửi, chỉ gửi phần mới
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

          // Đọc toàn bộ file audio hiện tại (legacy API dùng EncodingType.Base64)
          const base64Data = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });

          if (!base64Data) return;

          // Convert base64 sang bytes
          const currentAudioBytes = base64ToUint8Array(base64Data);
          const currentLength = currentAudioBytes.length;

          // Chỉ gửi phần audio MỚI (chưa gửi)
          if (currentLength > lastSentBytesRef.current) {
            // Lấy phần mới từ vị trí đã gửi cuối đến hiện tại
            const newAudioChunk = currentAudioBytes.slice(
              lastSentBytesRef.current
            );

            // Chỉ gửi nếu có ít nhất 640 bytes (20ms audio @ 16kHz mono 16bit)
            if (newAudioChunk.length >= 640) {
              if (
                wsRef.current &&
                wsRef.current.readyState === WebSocket.OPEN
              ) {
                // Gửi từng chunk nhỏ 640 bytes (giống như web gửi 320 samples * 2 bytes)
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
                  `📤 Sent ${newAudioChunk.length} bytes (from ${lastSentBytesRef.current} to ${currentLength})`
                );
                lastSentBytesRef.current = currentLength;
              }
            }
          }
        } catch (err) {
          // Ignore read errors during streaming
          console.warn("Audio streaming error:", err);
        }
      }, 300);

      setIsRecording(true);
      console.log("🎤 Recording started with audio streaming");
    } catch (error: any) {
      console.error("❌ Failed to start recording:", error);
      throw error;
    }
  }, [connectWs]);

  const stopRecording = useCallback(async () => {
    try {
      // Stop streaming interval first
      if (streamingIntervalRef.current) {
        clearInterval(streamingIntervalRef.current);
        streamingIntervalRef.current = null;
      }

      if (recordingRef.current) {
        // Get final audio data before stopping
        const uri = recordingRef.current.getURI();

        await recordingRef.current.stopAndUnloadAsync();

        // Send remaining audio data (phần cuối chưa gửi)
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

              // Chỉ gửi phần chưa gửi
              if (currentLength > lastSentBytesRef.current) {
                const remainingChunk = currentAudioBytes.slice(
                  lastSentBytesRef.current
                );
                if (remainingChunk.length > 0) {
                  wsRef.current.send(remainingChunk.buffer);
                  console.log(
                    `📤 Sent final audio chunk: ${remainingChunk.length} bytes`
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

      // Reset tracking variables
      lastSentBytesRef.current = 0;
      audioBufferRef.current = new Uint8Array(0);

      setIsRecording(false);
      console.log("🛑 Recording stopped (WebSocket still open)");
    } catch (error) {
      console.error("Error stopping recording:", error);
    }
  }, []);

  // Toggle chế độ câu hỏi
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

  // Kết thúc phiên
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

  // Broadcast question started
  const broadcastQuestionStarted = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send("question:started");
      console.log("📢 Sent question:started");
    }
  }, []);

  // Broadcast question processing
  const broadcastQuestionProcessing = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send("question:processing");
      console.log("📢 Sent question:processing");
    }
  }, []);

  // Broadcast session start (for secretary)
  const broadcastSessionStart = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send("session:start");
      console.log("📢 Sent session:start");
    }
  }, []);

  // Broadcast session end (for secretary)
  const broadcastSessionEnd = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send("session:end");
      console.log("📢 Sent session:end");
    }
  }, []);

  // Broadcast mic disabled (for secretary to disable all mics)
  const broadcastMicDisabled = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send("mic:disabled");
      console.log("📢 Sent mic:disabled");
    }
  }, []);

  // Broadcast speaker started
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

  // Broadcast speaker stopped
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
