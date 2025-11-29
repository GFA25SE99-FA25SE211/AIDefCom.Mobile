import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { AudioLevelMeter } from "../components/AudioLevelMeter";
import { SimpleAudioTest } from "../components/SimpleAudioTest";

export const AudioTestScreen = () => {
  const [isNativeActive, setIsNativeActive] = useState(false);
  const [isSoundLevelActive, setIsSoundLevelActive] = useState(false);
  const [currentLevel, setCurrentLevel] = useState(0);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.title}>Audio Level Test</Text>
        <Text style={styles.subtitle}>
          So sánh 2 phương pháp đo mức độ âm thanh
        </Text>

        {/* Native Module (với Xcode) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="phone-iphone" size={24} color="#007AFF" />
            <Text style={styles.sectionTitle}>Native Module (iOS)</Text>
          </View>
          <Text style={styles.description}>
            Sử dụng module native Swift - cần Xcode để build
          </Text>

          <AudioLevelMeter
            isActive={isNativeActive}
            useNativeModule={true}
            onLevelChange={setCurrentLevel}
            showNumericValue={true}
            barColor="#007AFF"
          />

          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: isNativeActive ? "#FF3B30" : "#007AFF" },
            ]}
            onPress={() => setIsNativeActive(!isNativeActive)}
          >
            <MaterialIcons
              name={isNativeActive ? "stop" : "play-arrow"}
              size={24}
              color="white"
            />
            <Text style={styles.buttonText}>
              {isNativeActive ? "Dừng Native" : "Bắt đầu Native"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sound Level Package (không cần Xcode) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="android" size={24} color="#4CAF50" />
            <Text style={styles.sectionTitle}>Simple Monitor</Text>
          </View>
          <Text style={styles.description}>
            Sử dụng simulated audio levels - luôn hoạt động, không cần
            permission
          </Text>

          <AudioLevelMeter
            isActive={isSoundLevelActive}
            useNativeModule={false}
            onLevelChange={setCurrentLevel}
            showNumericValue={true}
            barColor="#4CAF50"
          />

          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: isSoundLevelActive ? "#FF3B30" : "#4CAF50" },
            ]}
            onPress={() => setIsSoundLevelActive(!isSoundLevelActive)}
          >
            <MaterialIcons
              name={isSoundLevelActive ? "stop" : "play-arrow"}
              size={24}
              color="white"
            />
            <Text style={styles.buttonText}>
              {isSoundLevelActive ? "Dừng Simple" : "Bắt đầu Simple"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Current Level Display */}
        <View style={styles.levelDisplay}>
          <Text style={styles.levelLabel}>Mức âm thanh hiện tại:</Text>
          <Text style={styles.levelValue}>{Math.round(currentLevel)} dB</Text>
        </View>

        {/* Direct Test */}
        <SimpleAudioTest />

        {/* Instructions */}
        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>Hướng dẫn:</Text>
          <Text style={styles.instructionsText}>
            • Nhấn "Bắt đầu Package" để test không cần Xcode{"\n"}• Nhấn "Bắt
            đầu Native" để test với module native{"\n"}• Nói vào microphone để
            xem mức âm thanh thay đổi{"\n"}• Sound Level Package hoạt động trên
            cả iOS và Android
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollContainer: {
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
    color: "#333",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    color: "#666",
    marginBottom: 24,
  },
  section: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 8,
    color: "#333",
  },
  description: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  levelDisplay: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  levelLabel: {
    fontSize: 16,
    color: "#666",
    marginBottom: 8,
  },
  levelValue: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#333",
  },
  instructions: {
    backgroundColor: "#FFF8E1",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#FFB74D",
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#F57F17",
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: "#F57F17",
    lineHeight: 20,
  },
});
