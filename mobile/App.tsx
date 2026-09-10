import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
/*
  ⛔ Imported by their per-weight subpaths, not from the package root.

  The root `index.js` of these packages does `require()` on every weight it
  ships — 16 faces each, italics included. Importing four names from it still
  pulls all 32 into the module graph, and Metro then bundles every one: the
  first web export after this change carried ~2 MB of font files, most of
  them weights nothing here asks for. A subpath import brings in one file.

  If you add a weight, add the token in `theme.ts` and the subpath here.
*/
import { Literata_400Regular } from "@expo-google-fonts/literata/400Regular";
import { Literata_400Regular_Italic } from "@expo-google-fonts/literata/400Regular_Italic";
import { Literata_600SemiBold } from "@expo-google-fonts/literata/600SemiBold";
import { Literata_700Bold } from "@expo-google-fonts/literata/700Bold";
import { PublicSans_400Regular } from "@expo-google-fonts/public-sans/400Regular";
import { PublicSans_500Medium } from "@expo-google-fonts/public-sans/500Medium";
import { PublicSans_600SemiBold } from "@expo-google-fonts/public-sans/600SemiBold";
import { PublicSans_700Bold } from "@expo-google-fonts/public-sans/700Bold";

import { RootNavigator } from "./src/navigation/RootNavigator";
import { colors } from "./src/theme";

export default function App() {
  /**
   * Nothing renders until the faces are ready.
   *
   * Every type token in `theme.ts` names a family rather than a weight, so a
   * screen painted before the fonts land is painted in the system font at
   * Literata's metrics and then reflows under the reader. On the screen where
   * someone is describing chest pain, that is not a cosmetic problem.
   *
   * A *failure* is different from a wait: if the faces cannot load at all,
   * the app still opens and React Native falls back to the system font.
   * Blocking the emergency card behind a font download would be indefensible.
   */
  const [fontsLoaded, fontError] = useFonts({
    Literata_400Regular,
    Literata_400Regular_Italic,
    Literata_600SemiBold,
    Literata_700Bold,
    PublicSans_400Regular,
    PublicSans_500Medium,
    PublicSans_600SemiBold,
    PublicSans_700Bold,
  });

  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
