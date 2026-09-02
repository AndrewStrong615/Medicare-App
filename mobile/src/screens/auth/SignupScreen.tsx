import { useRef, useState } from "react";
import type { TextInput } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { AuthError, signup } from "@/services/authService";
import type { RootStackParamList } from "@/types/navigation";
import { MIN_PASSWORD_LENGTH, validateEmail, validatePassword } from "@/utils/validation";

type Props = NativeStackScreenProps<RootStackParamList, "Signup">;

export function SignupScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  const handleSignup = async () => {
    // Guards against a double tap creating two signup requests.
    if (submitting) return;

    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(null);
    setIsOffline(false);

    if (nextEmailError || nextPasswordError) return;

    setSubmitting(true);
    try {
      await signup(email.trim(), password);
      // Tells the sign-in screen to confirm the account was created, rather
      // than dropping the user there with no explanation.
      navigation.replace("Login", { accountCreated: true });
    } catch (error) {
      if (error instanceof AuthError) {
        setFormError(error.message);
        setIsOffline(error.isNetworkError);
      } else {
        setFormError("Something stopped us creating your account. Please try again in a moment.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen centerContent>
      <PageHeader
        eyebrow="MEDHELP"
        title="Create account"
        subtitle="You'll use this to sign in and keep your medication reminders."
      />

      {formError && (
        <ErrorNotice message={formError} onRetry={isOffline ? handleSignup : undefined} />
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
        placeholder="Choose a password"
        value={password}
        onChangeText={setPassword}
        error={passwordError}
        // Stated up front rather than only after a rejected submit.
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={handleSignup}
        editable={!submitting}
      />

      <AppButton
        label={submitting ? "Creating account…" : "Sign up"}
        onPress={handleSignup}
        loading={submitting}
        accessibilityHint="Creates your MedHelp account"
      />

      <AppButton
        label="Already have an account? Log in"
        variant="secondary"
        onPress={() => navigation.navigate("Login")}
        disabled={submitting}
      />
    </Screen>
  );
}

