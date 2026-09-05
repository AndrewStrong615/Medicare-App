import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { TextField } from "@/components/TextField";
import { Screen } from "@/components/Screen";
import {
  ApiError,
  searchProviders,
  type Provider,
} from "@/services/providerService";
import { getPostalCode, type LocationStatus } from "@/services/locationService";
import { MIN_TAP_TARGET, colors, elevation, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "ProviderSearch">;

/*
  Care settings are settings, not conditions — see the backend module note. The
  labels are the plain-English ones people use; the values are what the API
  accepts. This list is short and fixed rather than fetched, because a picker
  that is empty until a request returns is worse than one that is occasionally
  a release behind. The backend rejects anything not on its own list.
*/
const CARE_SETTINGS: Array<{ value: string; label: string }> = [
  { value: "urgent_care", label: "Urgent care" },
  { value: "family_medicine", label: "Family medicine" },
  { value: "internal_medicine", label: "Internal medicine" },
  { value: "pediatrics", label: "Paediatrics" },
  { value: "emergency", label: "Emergency medicine" },
  { value: "general_practice", label: "General practice" },
  { value: "hospital", label: "Hospital" },
];

/**
 * How long the ZIP field says "Checking your location…" before giving up on
 * saying it.
 *
 * Shorter than any deadline in `locationService`, and deliberately not tied to
 * one: the lookup may legitimately take fifteen seconds if the user is reading
 * an OS permission sheet, but the hint must not imply the app is busy for that
 * long. The lookup still fills the field in whenever it lands.
 */
const PREFILL_HINT_MS = 3_000;

/*
  Told to the user when the app could not work out where they are.

  Every one of these names what happened and what to do instead, because the
  fallback is the point: browsers refuse location far more often than phones
  do, so typing a ZIP is a first-class path through this feature rather than a
  consolation prize.

  `unsupported` is deliberately absent. On a browser with no Geolocation API at
  all this is a standing fact, not a fault, and a box about it on every visit
  is crying wolf — it is stated once, quietly, in the ZIP field's own hint,
  where the user is already looking and where the thing to do is to type.
*/
const LOCATION_NOTICES: Partial<Record<LocationStatus, string>> = {
  // "prompt" gets no notice at all — it is not a failure, it is the button
  // below being the thing to press.
  denied:
    "Your location is blocked for this site, so MedHelp can't fill in your " +
    "ZIP code. Type one below to search — everything else works the same. To " +
    "change that, allow location for this site in your browser's settings " +
    "(the icon at the left of the address bar) and reload.",
  timeout:
    "MedHelp didn't get an answer about your location — the permission " +
    "prompt may still be waiting, or your device may not have a fix yet. " +
    "Type a ZIP code below to search.",
  unavailable:
    "MedHelp couldn't work out a ZIP code from your location. That happens " +
    "outside the US, or when your device can't get a position. Type a ZIP " +
    "code below to search.",
  insecure:
    "Browsers only share your location with pages served over HTTPS, and " +
    "this one isn't. Type a ZIP code below to search — or open MedHelp over " +
    "HTTPS, or at localhost, to have it filled in for you.",
};

/** The ZIP field's hint, which doubles as where a platform limit is stated. */
function zipHint(locating: boolean, status: LocationStatus | null): string {
  if (locating) return "Checking your location…";
  if (status === "prompt") {
    return (
      "Type your ZIP code, or use the button below to let your browser fill " +
      "it in. Only the ZIP is sent."
    );
  }
  if (status === "unsupported") {
    return (
      "Type your ZIP code — this browser can't share your location. " +
      "Only the ZIP is sent."
    );
  }
  return "Used to search the provider directory. Only the ZIP is sent.";
}

/**
 * Nearest first.
 *
 * Distance is the only ordering this app applies. Ranking providers on any
 * clinical ground would be a judgement MedHelp may not make — the same rule as
 * the MedlinePlus topic filter.
 */
function sortByDistance(providers: Provider[]): Provider[] {
  return [...providers].sort((a, b) => {
    if (a.distanceMiles === null && b.distanceMiles === null) return 0;
    // Providers with no distance sink below those with one, rather than being
    // dropped — a missing distance says nothing about the provider.
    if (a.distanceMiles === null) return 1;
    if (b.distanceMiles === null) return -1;
    return a.distanceMiles - b.distanceMiles;
  });
}

function formatDistance(miles: number | null): string | null {
  if (miles === null) return null;
  // "~" and one decimal below ten miles. The tilde is doing real work: this is
  // a straight-line estimate between ZIP centroids, not a driving distance,
  // and it should not read as though the app has measured the route.
  return miles < 10 ? `~${miles.toFixed(1)} mi` : `~${Math.round(miles)} mi`;
}

function ProviderRow({
  provider,
  onPress,
}: {
  provider: Provider;
  onPress: () => void;
}) {
  const distance = formatDistance(provider.distanceMiles);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={provider.name}
      accessibilityHint="Opens this provider's details"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text style={styles.rowName}>{provider.name}</Text>
      {provider.specialty && (
        <Text style={styles.rowSpecialty}>{provider.specialty}</Text>
      )}
      <View style={styles.rowMeta}>
        {provider.address && (
          <Text style={styles.rowAddress} numberOfLines={2}>
            {provider.address}
          </Text>
        )}
        {distance && <Text style={styles.rowDistance}>{distance}</Text>}
      </View>
    </Pressable>
  );
}

export function ProviderSearchScreen({ navigation, route }: Props) {
  const intake = route.params?.intake;

  const [postalCode, setPostalCode] = useState("");
  const [careSetting, setCareSetting] = useState(
    // Someone who arrived from an URGENT result is being told to be seen soon,
    // so urgent care is the sensible default to land on. It is still only a
    // default — every setting stays one tap away.
    intake?.tier === "URGENT" ? "urgent_care" : "family_medicine"
  );
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  // Guards against a slow search overwriting a newer one's results.
  const searchId = useRef(0);

  // Ask the device where it is, once, to save typing. Not getting an answer is
  // an ordinary outcome — refused permission, no fix, a build without the
  // native module — and the ZIP field is simply typed in instead. What is not
  // acceptable is leaving the hint on "Checking your location…" forever, so
  // `getPostalCode` is guaranteed to settle and reports why when it can't.
  useEffect(() => {
    let active = true;
    const hintTimer = setTimeout(() => {
      if (active) setLocating(false);
    }, PREFILL_HINT_MS);

    void (async () => {
      // No `prompt: true`: this must not throw a permission request at
      // someone who has just opened the screen. It only uses a permission
      // already granted, and otherwise reports "prompt" so the button below
      // becomes the way in.
      const { postalCode: detected, status } = await getPostalCode();
      if (!active) return;
      clearTimeout(hintTimer);
      // Only prefill an untouched field. A late answer must not overwrite a
      // ZIP the user has since typed for themselves.
      if (detected) {
        setPostalCode((current) => (current === "" ? detected : current));
      }
      setLocationStatus(status);
      setLocating(false);
    })();

    return () => {
      active = false;
      clearTimeout(hintTimer);
    };
  }, []);

  const runSearch = useCallback(async () => {
    const zip = postalCode.replace(/\D/g, "").slice(0, 5);
    if (zip.length !== 5) {
      setZipError("Enter a 5-digit ZIP code.");
      return;
    }
    const id = ++searchId.current;
    setZipError(null);
    setError(null);
    setNeedsSignIn(false);
    setLoading(true);

    try {
      const result = await searchProviders(zip, careSetting);

      // Distances arrive with the results, so nothing here waits on the
      // location subsystem. That is deliberate and load-bearing: this screen
      // once appeared to do nothing because the provider list sat behind an
      // `await` on an unanswered permission prompt.
      if (id !== searchId.current) return;
      setProviders(sortByDistance(result.providers));
    } catch (caught) {
      if (id !== searchId.current) return;
      const message =
        caught instanceof ApiError
          ? caught.message
          : "We couldn't search for providers right now. Please try again in a moment.";
      setError(message);
      // The token lives in memory only, so a browser reload loses it. Without
      // this the screen offered "Try again" for a failure that retrying can
      // never fix, which is a dead end — the user needs the sign-in screen.
      setNeedsSignIn(caught instanceof ApiError && caught.isAuthError);
      setProviders(null);
    } finally {
      if (id === searchId.current) setLoading(false);
    }
  }, [careSetting, postalCode]);

  const locationNotice = locationStatus ? LOCATION_NOTICES[locationStatus] : undefined;

  /*
    Asking is always something the user starts.

    Auto-prompting on mount is why this appeared never to ask at all: a
    permission request not tied to a user gesture is suppressed by some
    browsers outright, and a site the user once blocked will never prompt
    again — leaving no way back from inside the app. A button guarantees the
    gesture, and gives a second chance after unblocking without a reload.
  */
  const askForLocation = useCallback(async () => {
    setLocating(true);
    const { postalCode: detected, status } = await getPostalCode({ prompt: true });
    setLocationStatus(status);
    setLocating(false);
    if (detected) setPostalCode(detected);
  }, []);

  // Offered whenever asking could still help. Not shown once we have a ZIP
  // from the browser, and not shown where asking is impossible — an old
  // browser or a page the browser will not geolocate at all.
  const canAskForLocation =
    locationStatus !== null &&
    locationStatus !== "ok" &&
    locationStatus !== "unsupported" &&
    locationStatus !== "insecure";

  return (
    <Screen wide>
      {intake && (
        <View style={styles.context}>
          <Text style={styles.contextHeading}>
            {intake.tier === "URGENT"
              ? "Following up on your symptom check"
              : "From your symptom check"}
          </Text>
          <Text style={styles.contextBody}>
            What you described will be carried over as the reason for your
            visit, so you don't have to type it again. You can edit it before
            anything is saved.
          </Text>
        </View>
      )}

      <View style={styles.searchCard}>
        <TextField
          label="ZIP code"
          value={postalCode}
          onChangeText={setPostalCode}
          error={zipError}
          hint={zipHint(locating, locationStatus)}
          keyboardType="number-pad"
          placeholder="10001"
          returnKeyType="search"
          onSubmitEditing={() => void runSearch()}
        />

        <View>
          <Text style={styles.fieldLabel}>Type of care</Text>
          <View style={styles.chips}>
            {CARE_SETTINGS.map((setting) => {
              const selected = setting.value === careSetting;
              return (
                <Pressable
                  key={setting.value}
                  onPress={() => setCareSetting(setting.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={setting.label}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.chipPressed,
                  ]}
                >
                  <Text
                    style={[styles.chipText, selected && styles.chipTextSelected]}
                  >
                    {setting.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {canAskForLocation && (
          <AppButton
            label={locating ? "Getting your location…" : "Use my location"}
            variant="secondary"
            onPress={() => void askForLocation()}
            loading={locating}
            disabled={locating}
            accessibilityHint="Asks your browser for your location to fill in the ZIP code"
          />
        )}

        <AppButton
          label="Search"
          onPress={() => void runSearch()}
          loading={loading}
          disabled={loading}
        />
      </View>

      {/*
        Say why the ZIP was not filled in, rather than leaving a blank field
        and no distances with no explanation. This is a note, not an alert:
        declining to share your location with a health app is a reasonable
        choice, and the whole feature still works by typing.
      */}
      {locationNotice && (
        <View style={styles.locationNotice} accessibilityLiveRegion="polite">
          <Text style={styles.locationNoticeText}>{locationNotice}</Text>
        </View>
      )}

      {error && (
        <ErrorNotice
          message={error}
          onRetry={
            needsSignIn
              ? () => navigation.navigate("Login")
              : () => void runSearch()
          }
          retryLabel={needsSignIn ? "Sign in" : "Try again"}
        />
      )}

      {loading && (
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Searching the provider directory…</Text>
        </View>
      )}

      {!loading && providers !== null && providers.length === 0 && (
        <EmptyState
          icon="search"
          title="No providers found"
          description={
            "No providers of this type are listed in that ZIP code. Try a " +
            "different type of care, or a nearby ZIP code."
          }
        />
      )}

      {!loading && providers !== null && providers.length > 0 && (
        <View style={styles.results}>
          <Text style={styles.resultsHeading}>
            {providers.length} {providers.length === 1 ? "provider" : "providers"}
          </Text>
          {providers.map((provider) => (
            <ProviderRow
              key={provider.npi}
              provider={provider}
              onPress={() =>
                navigation.navigate("ProviderDetail", { provider, intake })
              }
            />
          ))}
          {/*
            Attribution, and an honest statement of what this list is. The
            directory says who exists and where; it does not say who is taking
            patients, who is open now, or who is in network. Leaving that
            unsaid would let the list imply a curation the app has not done —
            and choosing between providers on clinical grounds is a judgement
            this app may not make.
          */}
          <Text style={styles.sourceNote}>
            Listings come from the {providers[0].sourceName}. MedHelp does not
            rank or recommend providers, and cannot tell you who is accepting
            patients, open now, or covered by your insurance — please check
            with the provider.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  context: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderLeftWidth: 5,
    borderLeftColor: colors.accent,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  contextHeading: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  contextBody: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  searchCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    ...elevation.sm,
  },
  fieldLabel: {
    ...typography.overline,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    minHeight: MIN_TAP_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    ...elevation.sm,
  },
  chipPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  chipText: {
    ...typography.captionStrong,
    color: colors.textPrimary,
  },
  chipTextSelected: {
    color: colors.textOnAccent,
  },
  locationNotice: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  locationNoticeText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  results: {
    gap: spacing.md,
  },
  resultsHeading: {
    ...typography.overline,
    color: colors.textSecondary,
  },
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    minHeight: MIN_TAP_TARGET,
    ...elevation.sm,
  },
  rowPressed: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.accent,
  },
  rowName: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  rowSpecialty: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  rowMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  rowAddress: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  rowDistance: {
    ...typography.captionStrong,
    color: colors.accent,
  },
  sourceNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
