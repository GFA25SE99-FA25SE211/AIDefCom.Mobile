import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { colors, globalStyles } from "../utils/styles";
import { defenseSessionService, groupService } from "../services/api";
import { DefenseSession } from "../types/defense";
import { RootStackParamList } from "../navigation/AppNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const DashboardScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { user, logout } = useAuth();
  const [sessions, setSessions] = useState<DefenseSession[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = () => {
    Alert.alert("Logout", "Do you want to logout from the application?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", onPress: logout, style: "destructive" },
    ]);
  };

  useEffect(() => {
    const loadSessions = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Phân biệt role để dùng đúng API:
        // - Student: /defense-sessions/student/{userId}
        // - Lecturer: /defense-sessions/lecturer/{userId}
        // - Khác: getAll()
        let data: DefenseSession[] = [];
        if (user?.id && Array.isArray(user.roles) && user.roles.length > 0) {
          if (user.roles.includes("Student")) {
            data = await defenseSessionService.getByStudentId(user.id);
          } else if (user.roles.includes("Lecturer")) {
            data = await defenseSessionService.getByLecturerId(user.id);
          } else {
            data = await defenseSessionService.getAll();
          }
        } else {
          data = await defenseSessionService.getAll();
        }

        // Fetch group data cho mỗi session để lấy topicTitle
        const sessionsWithGroupData = await Promise.all(
          data.map(async (session) => {
            try {
              const group = await groupService.getById(session.groupId);
              return {
                ...session,
                topicTitle_VN: group.topicTitle_VN || group.TopicTitle_VN,
                topicTitle_EN: group.topicTitle_EN || group.TopicTitle_EN,
                projectCode: group.projectCode || group.ProjectCode,
              };
            } catch (err) {
              console.warn(
                `Failed to load group data for ${session.groupId}:`,
                err
              );
              return session;
            }
          })
        );

        setSessions(sessionsWithGroupData);
      } catch (err: any) {
        console.error("Failed to load defense sessions", err);
        setError("Không tải được danh sách phiên bảo vệ");
      } finally {
        setIsLoading(false);
      }
    };

    loadSessions();
  }, [user?.id, user?.roles]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTimeRange = (start: string, end: string) => {
    // Backend sends TimeSpan, usually as "HH:mm:ss"
    const format = (t: string) => t?.slice(0, 5) || "";
    return `${format(start)} - ${format(end)}`;
  };

  const isUpcoming = (session: DefenseSession) => {
    const today = new Date();
    const date = new Date(session.defenseDate);
    return date >= new Date(today.toDateString());
  };

  return (
    <View style={globalStyles.container}>
      <StatusBar style="auto" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.fullName?.charAt(0).toUpperCase() || "S"}
            </Text>
          </View>
          <View style={styles.userDetails}>
            <Text style={styles.welcomeText}>Xin chào,</Text>
            <Text style={styles.userName}>{user?.fullName || "Student"}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <MaterialIcons name="logout" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>My Defense Sessions</Text>
        <Text style={styles.sectionSubtitle}>
          View all your defense sessions
        </Text>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : sessions.length === 0 ? (
          <Text style={styles.emptyText}>
            Bạn chưa có phiên bảo vệ nào được lên lịch.
          </Text>
        ) : (
          sessions.map((session) => (
            <TouchableOpacity
              key={session.id}
              style={styles.sessionCard}
              activeOpacity={0.8}
              onPress={() =>
                navigation.navigate("DefenseSessionDetail", { session })
              }
            >
              <View style={styles.sessionHeader}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {isUpcoming(session) ? "Upcoming" : "Completed"}
                  </Text>
                </View>
              </View>

              <View style={styles.sessionBody}>
                <View style={styles.sessionRow}>
                  <View style={styles.iconCircle}>
                    <MaterialIcons
                      name="school"
                      size={24}
                      color={colors.surface}
                    />
                  </View>
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionTitle}>
                      Group {session.groupId}
                    </Text>
                    <Text style={styles.sessionId}>
                      ID: DEF-{session.defenseDate.slice(0, 4)}-
                      {String(session.id).padStart(3, "0")}
                    </Text>
                  </View>
                </View>

                <View style={styles.sessionDetailCard}>
                  <Text style={styles.detailLabel}>Project</Text>
                  <Text style={styles.detailValue}>
                    {session.topicTitle_VN ||
                      session.TopicTitle_VN ||
                      session.topicTitle_EN ||
                      session.TopicTitle_EN ||
                      "No project title"}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <MaterialIcons
                    name="event"
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={styles.metaText}>
                    {formatDate(session.defenseDate)}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <MaterialIcons
                    name="access-time"
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={styles.metaText}>
                    {formatTimeRange(session.startTime, session.endTime)}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <MaterialIcons
                    name="location-on"
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={styles.metaText}>{session.location}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  avatarText: {
    color: colors.surface,
    fontSize: 24,
    fontWeight: "bold",
  },
  userDetails: {
    flex: 1,
  },
  welcomeText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  userName: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  logoutButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.text,
    marginTop: 24,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: colors.error,
    marginTop: 12,
  },
  emptyText: {
    color: colors.textSecondary,
    marginTop: 12,
  },
  sessionCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    overflow: "hidden",
  },
  sessionHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#ede9fe",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: {
    color: "#4f46e5",
    fontSize: 12,
    fontWeight: "600",
  },
  sessionBody: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#f97316",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  sessionId: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sessionDetailCard: {
    backgroundColor: "#f5f3ff",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 15,
    color: colors.text,
    fontWeight: "500",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  metaText: {
    marginLeft: 8,
    fontSize: 14,
    color: colors.textSecondary,
  },
});
