/**
 * Finding a provider to be seen by.
 *
 * The directory is the NPPES NPI Registry, proxied through the MedHelp
 * backend. Two consequences worth stating where a screen author will read
 * them:
 *
 * 1. **There is no availability data.** NPPES publishes none, and no booking
 *    partner is wired up, so a `Provider` here has no slots and no "next
 *    available" — see `backend/app/services/provider_directory.py`. A screen
 *    that wants to show a time has nothing honest to show.
 * 2. **The search sends no health information.** A ZIP code and a care setting
 *    from a fixed list, nothing else. The user's symptom description never
 *    reaches this call path.
 */

import { apiRequest, ApiError } from "@/services/apiClient";

export { ApiError };

export interface Provider {
  npi: string;
  name: string;
  specialty: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  sourceName: string;
  /**
   * Straight-line miles from the centre of the searched ZIP to this provider's
   * street address, computed by the API (`provider_geo.py`).
   *
   * It used to be worked out on the phone from the OS geocoder, which meant
   * the web build showed no distances at all — a browser has no geocoder — and
   * meant twenty providers cost twenty geocoder lookups.
   *
   * It was then measured ZIP centroid to ZIP centroid, which had **no
   * resolution below one ZIP code**: since the directory is searched by exact
   * ZIP, most results sat in the searched ZIP and measured exactly zero, so a
   * whole page read "~0.0 mi". The provider end is now a real coordinate
   * geocoded from their address.
   *
   * **The user's end is still the centre of their ZIP**, because that is all
   * the app is told about where they are. So this reads as "about N miles from
   * the middle of your ZIP code" — close to the truth in a dense urban ZIP,
   * loose in a large rural one, and never a driving distance. Keep the "~".
   *
   * Null when the provider cannot be placed and the ZIP estimate would be
   * meaningless or zero — an ordinary case the UI must render as "no distance"
   * rather than as a number.
   */
  distanceMiles: number | null;
}

export interface ProviderSearchResult {
  providers: Provider[];
  careSetting: string;
  postalCode: string;
  /**
   * Whether MedHelp can send a request to a provider on the user's behalf.
   *
   * Always false today. The screens read this rather than hard-coding the
   * assumption, so that on the day a BAA-covered booking channel is procured
   * the UI stops understating what it can do, instead of quietly continuing
   * to tell people to phone.
   */
  onlineBookingAvailable: boolean;
}

interface ApiProvider {
  npi: string;
  name: string;
  specialty: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  source_name: string;
  distance_miles?: number | null;
}

interface ApiSearchResult {
  providers: ApiProvider[];
  care_setting: string;
  postal_code: string;
  online_booking_available: boolean;
}

function fromApi(item: ApiProvider): Provider {
  return {
    npi: item.npi,
    name: item.name,
    specialty: item.specialty,
    phone: item.phone,
    address: item.address,
    city: item.city,
    state: item.state,
    postalCode: item.postal_code,
    sourceName: item.source_name,
    distanceMiles: typeof item.distance_miles === "number" ? item.distance_miles : null,
  };
}

/** The care settings the directory can be searched by, keyed by API value. */
export async function listCareSettings(): Promise<Record<string, string>> {
  const body = await apiRequest("/providers/care-settings", {
    method: "GET",
    fallbackMessage: "We couldn't load the list of care types.",
  });
  return (body as Record<string, string>) ?? {};
}

export async function searchProviders(
  postalCode: string,
  careSetting: string
): Promise<ProviderSearchResult> {
  const query = new URLSearchParams({
    postal_code: postalCode,
    care_setting: careSetting,
  });
  const body = (await apiRequest(`/providers/search?${query.toString()}`, {
    method: "GET",
    fallbackMessage:
      "We couldn't search for providers right now. Please try again in a moment.",
  })) as ApiSearchResult;

  return {
    providers: (body?.providers ?? []).map(fromApi),
    careSetting: body?.care_setting ?? careSetting,
    postalCode: body?.postal_code ?? postalCode,
    onlineBookingAvailable: body?.online_booking_available === true,
  };
}
