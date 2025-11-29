import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { simpleAudioLevelMonitor } from "../utils/simpleAudioLevelMonitor";

export const SimpleAudioTest = () => {
  const [isActive, setIsActive] = useState(false);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    if (isActive) {
      const start = async () => {
        try {
          console.log("🧪 Testing simpleAudioLevelMonitor directly...");
          await simpleAudioLevelMonitor.startMonitoring();

          unsubscribe = simpleAudioLevelMonitor.onLevelUpdate((newLevel) => {
            console.log("📊 Direct level update:", newLevel);
            setLevel(newLevel);
          });
        } catch (error) {
          console.error("🔥 Direct test failed:", error);
        }
      };
      start();
    } else {
      const stop = async () => {
        try {
          await simpleAudioLevelMonitor.stopMonitoring();
          if (unsubscribe) {
            unsubscribe();
          }
          setLevel(0);
        } catch (error) {
          console.error("Error stopping:", error);
        }
      };
      stop();
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isActive]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Simple Audio Test</Text>
      <Text style={styles.level}>Level: {Math.round(level)}</Text>

      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: isActive ? "#FF3B30" : "#4CAF50" },
        ]}
        onPress={() => setIsActive(!isActive)}
      >
        <Text style={styles.buttonText}>
          {isActive ? "Stop" : "Start"} Direct Test
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 20,
  },
  level: {
    fontSize: 24,
    marginBottom: 20,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
  },
});
