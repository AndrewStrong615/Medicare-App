import { forwardRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ReturnKeyTypeOptions,
} from "react-native";

import { MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";

/**
 * A labelled input. The visible label stays put once typing starts (a
 * placeholder alone disappears, which is a problem for anyone who is
 * distracted or returning to a half-filled form) and is tied to the field for
 * screen readers.
 */

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Shown below the field and announced as part of the field's label. */
  error?: string | null;
  /** Persistent guidance shown when there is no error. */
  hint?: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps["keyboardType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  editable?: boolean;
  /** Grows the field for longer free-text entry. */
  multiline?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    value,
    onChangeText,
    error,
    hint,
    placeholder,
    secureTextEntry,
    keyboardType,
    autoCapitalize = "none",
    autoComplete,
    textContentType,
    returnKeyType,
    onSubmitEditing,
    editable = true,
    multiline = false,
  },
  ref
) {
  const [focused, setFocused] = useState(false);
  const describedBy = error ?? hint;

  return (
    <View style={styles.container}>
      <Text style={styles.label} nativeID={`${label}-label`}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        style={[
          styles.input,
          focused && styles.inputFocused,
          !!error && styles.inputError,
          !editable && styles.inputDisabled,
          multiline && styles.inputMultiline,
        ]}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "auto"}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        // Without these, iOS and Android password managers don't offer to fill
        // or save credentials, and iOS may autocorrect an email into nonsense.
        autoComplete={autoComplete}
        textContentType={textContentType}
        autoCorrect={false}
        spellCheck={false}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        editable={editable}
        accessibilityLabel={label}
        // Screen readers read the error/hint as part of the field rather than
        // as loose text elsewhere on the screen.
        accessibilityHint={describedBy}
        accessibilityState={{ disabled: !editable }}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  input: {
    minHeight: MIN_TAP_TARGET,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  inputMultiline: {
    minHeight: 120,
    paddingTop: spacing.md,
  },
  inputFocused: {
    borderColor: colors.borderFocus,
    // Two pixels of border rather than a colour-only change, so focus is
    // visible without relying on colour perception.
    borderWidth: 2,
  },
  inputError: {
    borderColor: colors.errorBorder,
    borderWidth: 2,
  },
  inputDisabled: {
    backgroundColor: colors.surfaceMuted,
    color: colors.textSecondary,
  },
  error: {
    ...typography.caption,
    color: colors.errorText,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
