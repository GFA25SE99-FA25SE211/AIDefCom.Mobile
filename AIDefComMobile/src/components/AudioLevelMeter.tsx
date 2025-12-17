import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { soundLevelMonitor } from "../utils/soundLevelMonitor";
import { audioLevelMonitor } from "../utils/audioLevelMonitor";
import { simpleAudioLevelMonitor } from "../utils/simpleAudioLevelMonitor";

interface AudioLevelMeterProps {
  isActive: boolean;
  useNativeModule?: boolean; // true = use native module, false = use simple monitor
  onLevelChange?: (level: number) => void;
  showNumericValue?: boolean;
  barColor?: string;
  backgroundColor?: string;
}

export const AudioLevelMeter: React.FC<AudioLevelMeterProps> = ({
  isActive,
  useNativeModule = false,
  onLevelChange,
  showNumericValue = true,
  barColor = "#4CAF50",
  backgroundColor = "#E0E0E0",
}) => {
  const [audioLevel, setAudioLevel] = useState(0);
  const [animatedLevel] = useState(new Animated.Value(0));

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    if (isActive) {
      const startMonitoring = async () => {
        try {
          const monitor = useNativeModule
            ? audioLevelMonitor
            : simpleAudioLevelMonitor;

          // Start monitoring
          await monitor.startMonitoring();

          // Subscribe to level updates
          unsubscribe = monitor.onLevelUpdate((level: number) => {
            setAudioLevel(level);
            onLevelChange?.(level);

            // Animate the level bar
            Animated.timing(animatedLevel, {
              toValue: level,
              duration: 100,
              useNativeDriver: false,
            }).start();
          });

          console.log(
            `📊 Audio level monitoring started (${
              useNativeModule ? "Native" : "Simple"
            })`
          );
        } catch (error) {
          console.error("Failed to start audio monitoring:", error);
        }
      };

      startMonitoring();
    } else {
      // Stop monitoring when not active
      const stopMonitoring = async () => {
        try {
          const monitor = useNativeModule
            ? audioLevelMonitor
            : simpleAudioLevelMonitor;
          await monitor.stopMonitoring();

          if (unsubscribe) {
            unsubscribe();
          }

          setAudioLevel(0);
          animatedLevel.setValue(0);

          console.log("📊 Audio level monitoring stopped");
        } catch (error) {
          console.error("Failed to stop audio monitoring:", error);
        }
      };

      stopMonitoring();
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isActive, useNativeModule]);

  const getLevelColor = (level: number) => {
    if (level < 30) return "#4CAF50"; // Green - Quiet
    if (level < 60) return "#FF9800"; // Orange - Moderate
    return "#F44336"; // Red - Loud
  };

  const getLevelText = (level: number) => {
    if (level < 20) return "Rất nhỏ";
    if (level < 40) return "Nhỏ";
    if (level < 60) return "Vừa";
    if (level < 80) return "To";
    return "Rất to";
  };

  return (
    <View style={styles.container}>
      {/* Audio Level Bar */}
      <View style={[styles.levelBar, { backgroundColor }]}>
        <Animated.View
          style={[
            styles.levelFill,
            {
              width: animatedLevel.interpolate({
                inputRange: [0, 100],
                outputRange: ["0%", "100%"],
                extrapolate: "clamp",
              }),
              backgroundColor: getLevelColor(audioLevel),
            },
          ]}
        />
      </View>

      {/* Level Indicators */}
      <View style={styles.indicators}>
        {[0, 25, 50, 75, 100].map((mark) => (
          <View key={mark} style={styles.indicator}>
            <Text style={styles.indicatorText}>{mark}</Text>
          </View>
        ))}
      </View>

      {/* Current Level Display */}
      {showNumericValue && (
        <View style={styles.levelDisplay}>
          <Text style={styles.levelValue}>{Math.round(audioLevel)}</Text>
          <Text style={styles.levelDescription}>
            {getLevelText(audioLevel)}
          </Text>
        </View>
      )}

      {/* Status */}
      <Text style={styles.statusText}>
        {isActive
          ? `Measuring audio (${useNativeModule ? "Native" : "Sound Level"})`
          : "Stop audio measurement"}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    margin: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  levelBar: {
    height: 20,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 10,
  },
  levelFill: {
    height: "100%",
    borderRadius: 10,
  },
  indicators: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  indicator: {
    alignItems: "center",
  },
  indicatorText: {
    fontSize: 12,
    color: "#666",
  },
  levelDisplay: {
    alignItems: "center",
    marginBottom: 10,
  },
  levelValue: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#333",
  },
  levelDescription: {
    fontSize: 16,
    color: "#666",
    marginTop: 5,
  },
  statusText: {
    textAlign: "center",
    fontSize: 14,
    color: "#888",
    fontStyle: "italic",
  },
});
