import { useState, useRef, useCallback, useEffect } from "react";
import { Audio } from "expo-av";

interface UseAudioRecorderProps {
  wsUrl: string; // WebSocket URL: wss://.../ws/stt?defense_session_id=XXX&role=member
  onWsEvent?: (msg: any) => void; // Event handler từ WebSocket
  autoConnect?: boolean; // Tự động kết nối WS khi load
}

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

    if (!wsUrl) return;

    isConnectingRef.current = true;
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
      } catch {
        console.log("WS raw message:", evt.data);
      }
    };

    ws.onerror = (e) => {
      console.error("❌ WebSocket error:", e);
      setWsConnected(false);
      isConnectingRef.current = false;
    };

    ws.onclose = () => {
      console.log("🔌 WebSocket closed");
      setWsConnected(false);
      isConnectingRef.current = false;
      wsRef.current = null;
    };
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

      // Monitor recording status và gửi audio chunks qua WebSocket
      recording.setOnRecordingStatusUpdate(async (status) => {
        if (status.isRecording && status.durationMillis) {
          // Lấy audio data từ recording (cần implement audio streaming)
          // Tạm thời: gửi khi recording dừng
        }
      });

      setIsRecording(true);
      console.log("🎤 Recording started");
    } catch (error: any) {
      console.error("❌ Failed to start recording:", error);
      throw error;
    }
  }, [connectWs]);

  const stopRecording = useCallback(async () => {
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
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

  return {
    isRecording,
    isAsking,
    wsConnected,
    startRecording,
    stopRecording,
    toggleAsk,
    stopSession,
    broadcastQuestionStarted,
    broadcastQuestionProcessing,
  };
};

