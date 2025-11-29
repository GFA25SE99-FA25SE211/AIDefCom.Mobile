import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { VoiceAuthScreen } from "../screens/VoiceAuthScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { AudioTestScreen } from "../screens/AudioTestScreen";
import { AudioRecordingTestScreen } from "../screens/AudioRecordingTestScreen";
import { Loading } from "../components/Loading";

export type RootStackParamList = {
  Login: undefined;
  VoiceAuth: undefined;
  Dashboard: undefined;
  AudioTest: undefined;
  AudioRecordingTest: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Loading />;
  }

  const initialRoute: keyof RootStackParamList = user
    ? "Dashboard"
    : "Login";

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={initialRoute}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="VoiceAuth" component={VoiceAuthScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="AudioTest" component={AudioTestScreen} />
        <Stack.Screen
          name="AudioRecordingTest"
          component={AudioRecordingTestScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
