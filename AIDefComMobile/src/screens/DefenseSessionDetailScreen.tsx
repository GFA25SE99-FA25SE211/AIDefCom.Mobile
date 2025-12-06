import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { MaterialIcons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { colors, globalStyles } from "../utils/styles";
import { DefenseSession, DefenseSessionUser, Group } from "../types/defense";
import { defenseSessionService, groupService, studentService } from "../services/api";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useAuth } from "../context/AuthContext";
import Toast from "react-native-toast-message";

type Props = NativeStackScreenProps<RootStackParamList, "DefenseSessionDetail">;

export const DefenseSessionDetailScreen: React.FC<Props> = ({
  route,
  navigation,
}) => {
  const { session } = route.params;
  const { user } = useAuth();

  const [users, setUsers] = useState<DefenseSessionUser[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [students, setStudents] = useState<any[]>([]); // Students với GroupRole
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Mic và WebSocket states
  const [sessionStarted, setSessionStarted] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null); // userId của người đang nói
  const mySessionIdRef = useRef<string | null>(null);
  
  // Question mode states (giống member web)
  const [questionResults, setQuestionResults] = useState<any[]>([]);
  const [hasQuestionFinalText, setHasQuestionFinalText] = useState(false);
  const questionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const waitingForQuestionResult = useRef<boolean>(false);

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: `Phiên bảo vệ nhóm ${session.groupId}`,
    });
  }, [navigation, session.groupId]);

  // WebSocket event handler
  const handleSTTEvent = (msg: any) => {
    const eventType = msg.type || msg.event;
    console.log("📨 WebSocket event received:", eventType, msg);

    // Handle WebSocket errors gracefully
    if (eventType === "error") {
      console.error("❌ WebSocket error event:", msg.message || msg);
      Toast.show({
        type: "error",
        text1: "Lỗi kết nối",
        text2: msg.message || "Không thể kết nối đến server. Vui lòng thử lại.",
      });
      setSessionStarted(false);
      return;
    }

    // Handle WebSocket close events
    if (eventType === "closed") {
      console.log("🔌 WebSocket closed:", msg.code, msg.reason);
      setSessionStarted(false);
      setCurrentSpeaker(null);
      if (isRecording) {
        stopRecording();
        if (user?.id) {
          broadcastSpeakerStopped(user.id);
        }
      }
      return;
    }

    if (eventType === "session_started" || eventType === "session:started") {
      console.log("✅ Session started event received");
      setSessionStarted(true);
      Toast.show({
        type: "info",
        text1: "Phiên bảo vệ đã bắt đầu",
        text2: "Bạn có thể sử dụng mic",
      });
    } else if (eventType === "session_ended" || eventType === "session_stopped" || eventType === "session:ended") {
      setSessionStarted(false);
      setCurrentSpeaker(null);
      // Nếu đang recording, dừng lại
      if (isRecording) {
        stopRecording();
        if (user?.id) {
          broadcastSpeakerStopped(user.id);
        }
      }
      Toast.show({
        type: "info",
        text1: "Phiên bảo vệ đã kết thúc",
      });
    } else if (eventType === "mic_disabled" || eventType === "mic:disabled" || eventType === "broadcast_mic_disabled") {
      // Thư ký đã tắt mic - tự động tắt mic của student
      if (isRecording) {
        stopRecording();
        if (user?.id) {
          broadcastSpeakerStopped(user.id);
        }
        setCurrentSpeaker(null);
        Toast.show({
          type: "info",
          text1: "Mic đã bị tắt",
          text2: "Thư ký đã tắt mic. Mic của bạn cũng đã bị tắt.",
        });
      }
    } else if (eventType === "connected") {
      console.log("✅ WebSocket connected:", msg.session_id, "room_size:", msg.room_size);
      if (msg.session_id) {
        mySessionIdRef.current = msg.session_id;
      }
      // Nếu đã có room_size > 0 và session đang active, có thể tự động enable
      // Nhưng để an toàn, vẫn chờ session_started từ thư ký
    } else if (eventType === "session_started" || eventType === "broadcast_session_started") {
      // Thư ký đã bắt đầu phiên
      console.log("🎤 Session started by secretary - mic enabled");
      setSessionStarted(true);
    } else if (eventType === "speaker:started" || eventType === "speaker_started") {
      // Người khác bắt đầu nói
      const speakerId = msg.userId || msg.user_id || msg.speakerId;
      if (speakerId && speakerId !== user?.id) {
        setCurrentSpeaker(speakerId);
        const speakerName = users.find((u) => (u.id || u.userId || u.Id) === speakerId)?.fullName || "Một thành viên";
        Toast.show({
          type: "info",
          text1: `${speakerName} đang nói`,
          text2: "Vui lòng chờ đến lượt của bạn",
        });
      }
    } else if (eventType === "speaker:stopped" || eventType === "speaker_stopped") {
      // Người khác dừng nói
      const speakerId = msg.userId || msg.user_id || msg.speakerId;
      if (speakerId && speakerId === currentSpeaker) {
        setCurrentSpeaker(null);
        console.log("✅ Speaker stopped, mic is now available");
      }
    } else if (eventType === "broadcast_speaker_started" || eventType === "broadcast_speaker:started") {
      // Broadcast từ backend khi có người bắt đầu nói
      const speakerId = msg.userId || msg.user_id || msg.speakerId;
      if (speakerId && speakerId !== user?.id) {
        setCurrentSpeaker(speakerId);
        const speakerName = users.find((u) => (u.id || u.userId || u.Id) === speakerId)?.fullName || "Một thành viên";
        Toast.show({
          type: "info",
          text1: `${speakerName} đang nói`,
          text2: "Vui lòng chờ đến lượt của bạn",
        });
      }
    } else if (eventType === "broadcast_speaker_stopped" || eventType === "broadcast_speaker:stopped") {
      // Broadcast từ backend khi có người dừng nói
      const speakerId = msg.userId || msg.user_id || msg.speakerId;
      if (speakerId && speakerId === currentSpeaker) {
        setCurrentSpeaker(null);
        console.log("✅ Broadcast: Speaker stopped, mic is now available");
      }
    }
  };

  // WebSocket URL - thêm user_id để backend nhận diện voice
  const WS_URL = session.id && user?.id
    ? `wss://fastapi-service.happyforest-7c6ec975.southeastasia.azurecontainerapps.io/ws/stt?defense_session_id=${session.id}&role=member&user_id=${user.id}`
    : session.id
    ? `wss://fastapi-service.happyforest-7c6ec975.southeastasia.azurecontainerapps.io/ws/stt?defense_session_id=${session.id}&role=member`
    : "";

  const {
    isRecording,
    wsConnected,
    startRecording,
    stopRecording,
    stopSession,
    broadcastSpeakerStarted,
    broadcastSpeakerStopped,
  } = useAudioRecorder({
    wsUrl: WS_URL,
    onWsEvent: handleSTTEvent,
    autoConnect: !!session.id, // Tự động kết nối để nhận session_started
  });

  useEffect(() => {
    const loadDetail = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [usersRes, groupRes, studentsRes] = await Promise.all([
          defenseSessionService.getUsersBySessionId(session.id),
          groupService.getById(session.groupId),
          studentService.getByGroupId(session.groupId).catch(() => []), // Fallback nếu API chưa có
        ]);

        setUsers(usersRes);
        setGroup(groupRes);
        setStudents(studentsRes);
      } catch (err) {
        console.error("Failed to load defense session detail", err);
        setError("Không tải được chi tiết phiên bảo vệ");
      } finally {
        setIsLoading(false);
      }
    };

    loadDetail();
  }, [session.id, session.groupId]);

  // Cleanup: reset speaker state khi unmount hoặc session end
  useEffect(() => {
    return () => {
      if (isRecording && user?.id) {
        broadcastSpeakerStopped(user.id);
      }
      setCurrentSpeaker(null);
    };
  }, [isRecording, user?.id, broadcastSpeakerStopped]);

  const handleToggleRecording = async () => {
    if (isRecording) {
      // Dừng nói và broadcast
      try {
        stopRecording();
        // Broadcast speaker stopped TRƯỚC khi reset state
        if (user?.id) {
          broadcastSpeakerStopped(user.id);
        }
        // Reset state sau khi broadcast
        setCurrentSpeaker(null);
      } catch (error: any) {
        console.error("Error stopping recording:", error);
        Alert.alert("Lỗi", "Không thể dừng ghi âm");
      }
    } else {
      if (!sessionStarted) {
        Alert.alert(
          "Chưa bắt đầu phiên",
          "Vui lòng chờ thư ký bắt đầu phiên bảo vệ"
        );
        return;
      }
      
      // Kiểm tra xem có người khác đang nói không
      if (currentSpeaker && currentSpeaker !== user?.id) {
        const speakerName = users.find((u) => (u.id || u.userId || u.Id) === currentSpeaker)?.fullName || "Một thành viên";
        Alert.alert(
          "Đang có người nói",
          `${speakerName} đang nói. Vui lòng chờ đến lượt của bạn.`
        );
        return;
      }
      
      // Kiểm tra WebSocket connection
      if (!wsConnected) {
        console.warn("⚠️ WebSocket not connected, attempting to connect...");
        Alert.alert(
          "Chưa kết nối",
          "Đang kết nối WebSocket. Vui lòng thử lại sau."
        );
        return;
      }
      
      console.log("🎤 Attempting to start recording:", {
        sessionStarted,
        wsConnected,
        currentSpeaker,
        userId: user?.id,
      });
      
      try {
        // Broadcast speaker started TRƯỚC khi start recording để các client khác biết
        if (user?.id) {
          broadcastSpeakerStarted(user.id);
          setCurrentSpeaker(user.id);
        }
        // Sau đó mới start recording
        await startRecording();
        console.log("✅ Recording started successfully");
      } catch (error: any) {
        console.error("❌ Failed to start recording:", error);
        // Nếu start recording thất bại, reset speaker state
        if (user?.id) {
          broadcastSpeakerStopped(user.id);
          setCurrentSpeaker(null);
        }
        Alert.alert("Lỗi", error.message || "Không thể bắt đầu ghi âm");
      }
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatTimeRange = (start: string, end: string) => {
    const format = (t: string) => t?.slice(0, 5) || "";
    return `${format(start)} - ${format(end)}`;
  };

  // Map backend response (Id, FullName, Email, Role) sang format dùng trong UI
  const mappedUsers = users.map((u) => ({
    ...u,
    userId: u.id || u.userId || u.Id,
    fullName: u.fullName || u.FullName,
    email: u.email || u.Email,
    roleName: u.role || u.Role || u.roleName,
    roleType: (u.role || u.Role || "").toLowerCase().includes("student")
      ? "Student"
      : "Council",
  }));

  const councilMembers = mappedUsers.filter((u) => u.roleType !== "Student");

  // Ưu tiên lấy tất cả students từ getByGroupId (đầy đủ), sau đó merge với thông tin từ session nếu có
  // Đảm bảo hiển thị đủ tất cả thành viên trong nhóm
  const studentsWithRole = students.length > 0
    ? students.map((studentData: any) => {
        // Tìm thông tin từ session users nếu có
        const sessionUser = mappedUsers.find(
          (u) =>
            (u.userId || u.id || u.Id) === (studentData.id || studentData.Id || studentData.userId)
        );
        
        // Lấy groupRole từ studentData (API students/group/{groupId})
        const groupRole = studentData.groupRole || studentData.GroupRole || "Member";
        
        return {
          userId: studentData.id || studentData.Id || studentData.userId,
          id: studentData.id || studentData.Id || studentData.userId,
          fullName: sessionUser?.fullName || studentData.fullName || studentData.userName || studentData.FullName || "Unknown",
          FullName: sessionUser?.fullName || studentData.fullName || studentData.userName || studentData.FullName || "Unknown",
          email: sessionUser?.email || studentData.email || studentData.Email || "",
          studentCode: studentData.studentCode || studentData.StudentCode || studentData.id || studentData.Id,
          groupRole: groupRole,
        };
      })
    : // Fallback: nếu không có students từ getByGroupId, dùng từ session users
      mappedUsers
        .filter((u) => u.roleType === "Student")
        .map((user) => ({
          ...user,
          groupRole: "Member", // Default nếu không có data
        }));

  return (
    <View style={globalStyles.container}>
      <StatusBar style="auto" />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status Card với Mic Controls - giống web */}
        <View style={styles.micControlsCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>
              {sessionStarted
                ? currentSpeaker && currentSpeaker !== user?.id
                  ? `${users.find((u) => (u.id || u.userId || u.Id) === currentSpeaker)?.fullName || "Một thành viên"} đang nói`
                  : "Phiên bảo vệ đã bắt đầu"
                : wsConnected
                ? "Chờ thư ký bắt đầu phiên bảo vệ"
                : "Đang kết nối..."}
            </Text>
          </View>

          {/* Mic Controls - luôn hiển thị */}
          <View style={styles.micControlsRow}>
            <View style={styles.micButtonWrapper}>
              {!sessionStarted ? (
                // Khi chưa bắt đầu: hiển thị nút Start Mic disabled
                <View style={[styles.micButton, styles.micButtonDisabled]}>
                  <MaterialIcons
                    name="mic-none"
                    size={20}
                    color="#9ca3af"
                  />
                  <Text style={styles.micButtonTextDisabled}>Start Mic</Text>
                </View>
              ) : !isRecording ? (
                // Khi đã bắt đầu nhưng chưa recording: nút Start Mic màu cam
                <TouchableOpacity
                  onPress={handleToggleRecording}
                  disabled={!wsConnected || (currentSpeaker !== null && currentSpeaker !== user?.id)}
                  style={[
                    styles.micButton,
                    styles.micButtonOrange,
                    (!wsConnected || (currentSpeaker !== null && currentSpeaker !== user?.id)) && styles.micButtonDisabled,
                  ]}
                >
                  <MaterialIcons
                    name="mic-none"
                    size={20}
                    color={wsConnected && (!currentSpeaker || currentSpeaker === user?.id) ? "#ffffff" : "#9ca3af"}
                  />
                  <Text
                    style={[
                      styles.micButtonText,
                      (!wsConnected || (currentSpeaker !== null && currentSpeaker !== user?.id)) && styles.micButtonTextDisabled,
                    ]}
                  >
                    {currentSpeaker && currentSpeaker !== user?.id ? "Đang có người nói" : "Start Mic"}
                  </Text>
                </TouchableOpacity>
              ) : (
                // Khi đang recording: nút màu cam
                <TouchableOpacity
                  onPress={handleToggleRecording}
                  style={[styles.micButton, styles.micButtonOrange]}
                >
                  <MaterialIcons name="mic" size={20} color="#ffffff" />
                  <Text style={styles.micButtonText}>Stop Mic</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Connection status - luôn hiển thị, cách nút mic một khoảng */}
            <View style={styles.connectionDotWrapper}>
              <View
                style={[
                  styles.connectionDot,
                  wsConnected
                    ? styles.connectionDotConnected
                    : styles.connectionDotDisconnected,
                ]}
              />
            </View>
          </View>
        </View>

        <View style={styles.sessionCard}>
          <View style={styles.sessionHeader}>
            <Text style={styles.sessionTitle}>Phiên bảo vệ</Text>
            <Text style={styles.sessionSubtitle}>
              Nhóm {session.groupId} - Phòng {session.location}
            </Text>

            <View style={styles.chipRow}>
              <View style={styles.chip}>
                <MaterialIcons
                  name="event"
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.chipText}>
                  {formatDate(session.defenseDate)}
                </Text>
              </View>
              <View style={styles.chip}>
                <MaterialIcons
                  name="access-time"
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.chipText}>
                  {formatTimeRange(session.startTime, session.endTime)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <>
            {/* Group info */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <MaterialIcons
                  name="group"
                  size={22}
                  color={colors.primary}
                />
                <Text style={styles.sectionTitle}>Nhóm & đề tài</Text>
              </View>
              <Text style={styles.groupName}>
                {group?.projectCode || group?.ProjectCode || `Nhóm ${session.groupId}`}
              </Text>
              {(group?.topicTitle_VN || group?.TopicTitle_VN) ? (
                <>
                  <Text style={styles.sectionLabel}>Tên đề tài (Tiếng Việt)</Text>
                  <Text style={styles.sectionValue}>
                    {group.topicTitle_VN || group.TopicTitle_VN}
                  </Text>
                </>
              ) : null}
              {(group?.topicTitle_EN || group?.TopicTitle_EN) ? (
                <>
                  <Text style={styles.sectionLabel}>Tên đề tài (English)</Text>
                  <Text style={styles.sectionValue}>
                    {group.topicTitle_EN || group.TopicTitle_EN}
                  </Text>
                </>
              ) : null}
            </View>

            {/* Council members */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <MaterialIcons
                  name="assignment-ind"
                  size={22}
                  color={colors.primary}
                />
                <Text style={styles.sectionTitle}>Hội đồng</Text>
              </View>
              {councilMembers.length === 0 ? (
                <Text style={styles.emptyText}>
                  Chưa có thông tin thành viên hội đồng.
                </Text>
              ) : (
                councilMembers.map((m) => (
                  <View
                    key={`${m.userId || m.id || m.Id}-${m.roleName || m.role || m.Role}`}
                    style={styles.memberRow}
                  >
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarText}>
                        {(m.fullName || m.FullName)?.charAt(0).toUpperCase() || "L"}
                      </Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>
                        {m.fullName || m.FullName || "N/A"}
                      </Text>
                      <Text style={styles.memberRole}>
                        {m.roleName || m.role || m.Role || "Member"}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Student members - hiển thị rõ Leader/Member */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <MaterialIcons
                  name="school"
                  size={22}
                  color={colors.primary}
                />
                <Text style={styles.sectionTitle}>Thành viên nhóm</Text>
              </View>
              {studentsWithRole.length === 0 ? (
                <Text style={styles.emptyText}>
                  Chưa có thông tin sinh viên trong nhóm.
                </Text>
              ) : (
                studentsWithRole.map((m) => {
                  const isLeader = (m.groupRole || "").toLowerCase().includes("leader");
                  return (
                    <View
                      key={m.userId || m.id || m.Id}
                      style={styles.memberRow}
                    >
                    <View style={[styles.avatarCircle, styles.studentAvatar]}>
                      <Text style={styles.avatarText}>
                          {(m.fullName || m.FullName)?.charAt(0).toUpperCase() || "S"}
                      </Text>
                    </View>
                    <View style={styles.memberInfo}>
                        <View style={styles.memberNameRow}>
                          <Text style={styles.memberName}>
                            {m.fullName || m.FullName || "N/A"}
                          </Text>
                          {isLeader && (
                            <View style={styles.leaderBadge}>
                              <MaterialIcons name="star" size={14} color="#fbbf24" />
                              <Text style={styles.leaderBadgeText}>Leader</Text>
                            </View>
                          )}
                          {!isLeader && (
                            <View style={styles.memberBadge}>
                              <Text style={styles.memberBadgeText}>Member</Text>
                            </View>
                          )}
                        </View>
                      <Text style={styles.memberRole}>
                          {m.studentCode || m.userId || m.id || m.Id || "Student"}
                      </Text>
                    </View>
                  </View>
                  );
                })
              )}
            </View>

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <MaterialIcons
                name="arrow-back"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.backButtonText}>Quay lại danh sách phiên</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sessionCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    marginTop: 40,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  sessionHeader: {
    gap: 6,
  },
  sessionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  sessionSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eef2ff",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  chipText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "500",
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: colors.error,
    marginTop: 16,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  statusIndicator: {
    width: 40,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "flex-start",
    paddingHorizontal: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotActive: {
    backgroundColor: "#10b981",
  },
  statusDotInactive: {
    backgroundColor: "#9ca3af",
  },
  statusTextContainer: {
    flex: 1,
  },
  statusText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  groupName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  sectionLabel: {
    marginTop: 8,
    fontSize: 13,
    color: colors.textSecondary,
  },
  sectionValue: {
    fontSize: 14,
    color: colors.text,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  studentAvatar: {
    backgroundColor: "#f97316",
  },
  avatarText: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: "700",
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  memberRole: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    marginTop: 8,
    marginBottom: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: 8,
  },
  backButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "600",
  },
  micControlsCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    marginTop: 40,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  micControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  micButtonWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    flex: 1,
  },
  micButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#4b5563",
  },
  micButtonDisabled: {
    backgroundColor: "#4b5563",
    opacity: 0.6,
  },
  micButtonStop: {
    backgroundColor: "#ef4444",
  },
  micButtonOrange: {
    backgroundColor: "#f97316",
  },
  micButtonIndigo: {
    backgroundColor: "#6366f1",
  },
  micButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  micButtonTextDisabled: {
    color: "#9ca3af",
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  connectionDotWrapper: {
    marginLeft: 12,
  },
  connectionDotConnected: {
    backgroundColor: "#10b981",
  },
  connectionDotDisconnected: {
    backgroundColor: "#9ca3af",
  },
  micHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: "italic",
  },
  memberNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  leaderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fef3c7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  leaderBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#92400e",
  },
  memberBadge: {
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  memberBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#3730a3",
  },
});


