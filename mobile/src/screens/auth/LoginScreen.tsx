import { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Screen } from "@/components/Screen";
import { SuccessNotice } from "@/components/SuccessNotice";
import { TextField } from "@/components/TextField";
import { AuthError, login } from "@/services/authService";
import { colors, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";
import { validateEmail, validateLoginPassword } from "@/utils/validation";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export function LoginScreen({ navigation, route }: Props) {
  const accountCreated = route.params?.accountCreated ?? false;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    // Guards against a double tap firing two login requests.
    if (submitting) return;

    const nextEmailError = validateEmail(email);
    const nextPasswordError = validateLoginPassword(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(null);
    setIsOffline(false);

    if (nextEmailError || nextPasswordError) return;

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigation.replace("Home");
    } catch (error) {
      if (error instanceof AuthError) {
        setFormError(error.message);
        setIsOffline(error.isNetworkError);
      } else {
        setFormError("Something stopped us signing you in. Please try again in a moment.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen centerContent>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Welcome back
        </Text>
        <Text style={styles.subtitle}>Sign in to see your medication reminders.</Text>
      </View>

      {accountCreated && !formError && (
        <SuccessNotice message="Your account is ready. Sign in to get started." />
      )}

      {formError && (
        <ErrorNotice
          message={formError}
          // Retrying only makes sense when the request never reached the
          // server; re-sending the same wrong password would just fail again.
          onRetry={isOffline ? handleLogin : undefined}
        />
      )}

      <TextField
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        error={emailError}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!submitting}
      />

      <TextField
        ref={passwordRef}
        label="Password"
        placeholder="Your password"
        value={password}
        onChangeText={setPassword}
        error={passwordError}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        // Lets the keyboard's Go key (and Enter in the browser) submit.
        onSubmitEditing={handleLogin}
        editable={!submitting}
      />

      <AppButton
        label={submitting ? "Signing in…" : "Log in"}
        onPress={handleLogin}
        loading={submitting}
        accessibilityHint="Signs you in to MedHelp"
      />

      <AppButton
        label="Need an account? Sign up"
        variant="secondary"
        onPress={() => navigation.navigate("Signup")}
        disabled={submitting}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
  title: {
    ...typography.display,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
