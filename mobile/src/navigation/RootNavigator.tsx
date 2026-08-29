import { NavigationContainer, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { HomeScreen } from "@/screens/HomeScreen";
import { LoginScreen } from "@/screens/auth/LoginScreen";
import { MedicationRemindersScreen } from "@/screens/medication-reminders/MedicationRemindersScreen";
import { SignupScreen } from "@/screens/auth/SignupScreen";
import { SymptomDetailScreen } from "@/screens/symptom-lookup/SymptomDetailScreen";
import { SymptomLookupScreen } from "@/screens/symptom-lookup/SymptomLookupScreen";
import { colors } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme: Theme = {
  dark: false,
  colors: {
    primary: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.accent,
  },
};

export function RootNavigator() {
  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { color: colors.textPrimary },
          headerTintColor: colors.accent,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {/*
          The auth screens carry their own on-page headings, so a navigation
          header would just repeat the title back to the user.
        */}
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Signup" component={SignupScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="SymptomLookup"
          component={SymptomLookupScreen}
          options={{ title: "Symptom Lookup" }}
        />
        <Stack.Screen
          name="SymptomDetail"
          component={SymptomDetailScreen}
          options={{ title: "Health Topic" }}
        />
        <Stack.Screen
          name="MedicationReminders"
          component={MedicationRemindersScreen}
          options={{ title: "Medication Reminders" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
