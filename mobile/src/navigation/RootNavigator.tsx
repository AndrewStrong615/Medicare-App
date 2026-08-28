import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import type { RootStackParamList } from "@/types/navigation";
import { LoginScreen } from "@/screens/auth/LoginScreen";
import { SignupScreen } from "@/screens/auth/SignupScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { SymptomLookupScreen } from "@/screens/symptom-lookup/SymptomLookupScreen";
import { MedicationRemindersScreen } from "@/screens/medication-reminders/MedicationRemindersScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Log in" }} />
        <Stack.Screen name="Signup" component={SignupScreen} options={{ title: "Sign up" }} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: "MedHelp" }} />
        <Stack.Screen
          name="SymptomLookup"
          component={SymptomLookupScreen}
          options={{ title: "Symptom Lookup" }}
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
