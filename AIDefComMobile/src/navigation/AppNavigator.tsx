import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { VoiceRegistrationScreen } from "../screens/VoiceRegistrationScreen";
import { VoiceAuthScreen } from "../screens/VoiceAuthScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { Loading } from "../components/Loading";

export type RootStackParamList = {
  Login: undefined;
  VoiceRegistration: undefined;
  VoiceAuth: undefined;
  Dashboard: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Loading />;
  }

  const initialRoute: keyof RootStackParamList = user ? "VoiceRegistration" : "Login";

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="VoiceRegistration" component={VoiceRegistrationScreen} />
        <Stack.Screen name="VoiceAuth" component={VoiceAuthScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
