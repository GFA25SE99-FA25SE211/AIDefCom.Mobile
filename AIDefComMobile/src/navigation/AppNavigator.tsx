import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { VoiceRegistrationScreen } from "../screens/VoiceRegistrationScreen";
import { VoiceAuthScreen } from "../screens/VoiceAuthScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { AudioTestScreen } from "../screens/AudioTestScreen";
import { AudioRecordingTestScreen } from "../screens/AudioRecordingTestScreen";
import { Loading } from "../components/Loading";
import { DefenseSessionDetailScreen } from "../screens/DefenseSessionDetailScreen";
import { DefenseSession } from "../types/defense";

export type RootStackParamList = {
  Login: undefined;
  VoiceRegistration: undefined;
  VoiceAuth: undefined;
  Dashboard: undefined;
  AudioTest: undefined;
  AudioRecordingTest: undefined;
  DefenseSessionDetail: { session: DefenseSession };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Loading />;
  }

  // IMPORTANT: ALL ROLES must go through voice enrollment check
  // - When user logs in via LoginScreen, navigateByEnrollmentStatus() is called
  //   which redirects to VoiceRegistration (if not enrolled) or VoiceAuth (if enrolled)
  // - When app restarts with logged-in user, VoiceRegistrationScreen will check
  //   enrollment status on mount and redirect to VoiceAuth if already enrolled
  // - This ensures NO role can bypass voice enrollment requirement
  const initialRoute: keyof RootStackParamList = user
    ? "VoiceRegistration"
    : "Login";

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={initialRoute}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen
          name="VoiceRegistration"
          component={VoiceRegistrationScreen}
        />
        <Stack.Screen name="VoiceAuth" component={VoiceAuthScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen
          name="DefenseSessionDetail"
          component={DefenseSessionDetailScreen}
        />
        <Stack.Screen name="AudioTest" component={AudioTestScreen} />
        <Stack.Screen
          name="AudioRecordingTest"
          component={AudioRecordingTestScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
