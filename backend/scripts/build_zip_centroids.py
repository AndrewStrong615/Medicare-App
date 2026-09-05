"""
Rebuild `app/data/zcta_centroids.csv.gz` from the US Census ZCTA Gazetteer.

Run this only to refresh the data (the Census publishes yearly). The generated
file is committed, so neither the app nor its tests ever need the network.

    python scripts/build_zip_centroids.py

Why this file exists at all
---------------------------
A browser can tell us *where the user is* (`navigator.geolocation`) but not
*what ZIP that is* - it has no geocoder, and `expo-location` throws on web for
exactly that reason. The provider directory is searched by ZIP, so without a
coordinate-to-ZIP step, location on the web build is useless.

The obvious fix would be a third-party geocoding API. This app does not do
that: sending a user's precise coordinates to Google or Mapbox would make them
a processor of location data for a health app, with no agreement in place, and
CLAUDE.md names "licensing a redistributable dataset and serving it locally" as
the preferred answer to precisely this shape of problem. So the lookup table
lives here and the coordinates go no further than MedHelp's own backend.

Source: US Census Bureau ZIP Code Tabulation Area Gazetteer, public domain.
https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html

`INTPTLAT`/`INTPTLONG` are the ZCTA's internal point - a representative point
guaranteed to fall inside the area, which is what a centroid should be for a
distance estimate. Four decimal places is about 11 metres, far finer than a
straight-line estimate between ZIP centroids can honestly claim.

A ZCTA is not identical to a USPS ZIP code: ZCTAs are built from census blocks
and a handful of PO-box-only ZIPs have no ZCTA. That is an acceptable gap for
"roughly where is this and how far away is that", and it is the same
approximation any ZIP-centroid distance makes.
"""

from __future__ import annotations

import csv
import gzip
import io
import sys
import zipfile
from pathlib import Path

import httpx

GAZETTEER_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/"
    "2023_Gazetteer/2023_Gaz_zcta_national.zip"
)

OUTPUT = Path(__file__).resolve().parent.parent / "app" / "data" / "zcta_centroids.csv.gz"


def main() -> int:
    print(f"Downloading {GAZETTEER_URL} ...")
    response = httpx.get(GAZETTEER_URL, timeout=120, follow_redirects=True)
    response.raise_for_status()

    archive = zipfile.ZipFile(io.BytesIO(response.content))
    member = next(name for name in archive.namelist() if name.endswith(".txt"))
    print(f"Reading {member} ...")

    rows: list[tuple[str, str, str]] = []
    with archive.open(member) as handle:
        text = io.TextIOWrapper(handle, encoding="utf-8")
        reader = csv.DictReader(text, delimiter="\t")
        for record in reader:
            # The Census pads its headers and values with spaces.
            clean = {key.strip(): (value or "").strip() for key, value in record.items()}
            zip_code = clean.get("GEOID", "")
            latitude = clean.get("INTPTLAT", "")
            longitude = clean.get("INTPTLONG", "")
            if len(zip_code) != 5 or not zip_code.isdigit():
                continue
            try:
                rows.append((zip_code, f"{float(latitude):.4f}", f"{float(longitude):.4f}"))
            except ValueError:
                continue

    if len(rows) < 30_000:
        print(f"Refusing to write only {len(rows)} rows - the source looks wrong.")
        return 1

    rows.sort()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    # mtime=0 so rebuilding identical data produces an identical file rather
    # than a spurious diff.
    with gzip.GzipFile(OUTPUT, "wb", mtime=0) as gz:
        writer = csv.writer(io.TextIOWrapper(gz, encoding="utf-8", newline=""))
        writer.writerow(["zip", "lat", "lon"])
        writer.writerows(rows)

    print(f"Wrote {len(rows)} ZIP centroids to {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
