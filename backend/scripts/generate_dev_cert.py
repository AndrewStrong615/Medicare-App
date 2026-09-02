"""
Generate a self-signed TLS certificate so the app can be served over https on
a LAN address, instead of plain http.

    python scripts/generate_dev_cert.py

Writes `backend/certs/dev-cert.pem` and `backend/certs/dev-key.pem` (both
gitignored), with subject-alternative names for `localhost`, `127.0.0.1`,
`::1`, this machine's hostname, and every private IPv4 address it currently
has. The IP SANs are the point: browsers match the certificate against the
address in the URL bar, and a certificate for `localhost` is rejected outright
at `https://192.168.1.5`.

## Why this exists

The app is served to a phone at `http://192.168.x.x`, which means:

* Email, password and every symptom description cross the LAN in the clear.
  Anyone on the same Wi-Fi can read them with no special access.
* Browsers refuse the Geolocation API outside a secure context, so the "Use my
  location" button cannot work at all on plain http — a limitation the app
  currently has to detect and explain (see `locationService.web.ts`).

Serving over TLS fixes both.

## What this is NOT

A self-signed certificate is not a trusted one. Encryption is real — traffic on
the wire is unreadable — but *authentication* is not: nothing proves the server
you reached is the one you meant, so this does not protect against someone on
the network impersonating it. Every device must be told once to trust the
certificate, or shown a warning to click through.

For anything with real users, get a certificate from a CA (Let's Encrypt, via a
real hostname) instead. This is the tool for the LAN-and-a-phone setup this
project actually runs on.
"""

from __future__ import annotations

import argparse
import datetime as dt
import ipaddress
import socket
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

CERT_DIR = Path(__file__).resolve().parent.parent / "certs"
CERT_PATH = CERT_DIR / "dev-cert.pem"
KEY_PATH = CERT_DIR / "dev-key.pem"

# Short enough that a stale copy on a phone expires rather than lingering for
# years, long enough not to be a chore.
VALID_DAYS = 365


def _is_private(address: str) -> bool:
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError:
        return False
    return parsed.is_private or parsed.is_loopback or parsed.is_link_local


def local_addresses() -> list[str]:
    """Every private IPv4 address this machine currently answers on."""
    found: set[str] = set()
    hostname = socket.gethostname()

    try:
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            address = info[4][0]
            if _is_private(address):
                found.add(address)
    except socket.gaierror:
        pass

    # getaddrinfo misses interfaces on some machines; asking the routing table
    # which address would be used to reach the internet is more reliable. No
    # packet is sent — a UDP socket only picks a route.
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        address = probe.getsockname()[0]
        if _is_private(address):
            found.add(address)
    except OSError:
        pass
    finally:
        probe.close()

    return sorted(found)


def build_san(extra: list[str]) -> tuple[x509.SubjectAlternativeName, list[str]]:
    hostname = socket.gethostname()
    names: list[x509.GeneralName] = [
        x509.DNSName("localhost"),
        x509.DNSName(hostname),
        x509.DNSName(f"{hostname}.local"),
        x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
        x509.IPAddress(ipaddress.ip_address("::1")),
    ]
    described = ["localhost", hostname, f"{hostname}.local", "127.0.0.1", "::1"]

    for address in [*local_addresses(), *extra]:
        try:
            parsed = ipaddress.ip_address(address)
        except ValueError:
            names.append(x509.DNSName(address))
            described.append(address)
            continue
        if address not in described:
            names.append(x509.IPAddress(parsed))
            described.append(address)

    return x509.SubjectAlternativeName(names), described


def generate(extra: list[str], force: bool) -> None:
    if CERT_PATH.exists() and KEY_PATH.exists() and not force:
        print(f"{CERT_PATH} already exists. Re-run with --force to replace it.")
        return

    CERT_DIR.mkdir(parents=True, exist_ok=True)

    # P-256 rather than RSA: smaller, faster, and universally supported by the
    # browsers and TLS stacks this has to work with.
    key = ec.generate_private_key(ec.SECP256R1())

    subject = x509.Name(
        [
            x509.NameAttribute(NameOID.COMMON_NAME, "MedHelp local development"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "MedHelp (development only)"),
        ]
    )

    san, described = build_san(extra)
    now = dt.datetime.now(dt.timezone.utc)

    certificate = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(minutes=5))
        .not_valid_after(now + dt.timedelta(days=VALID_DAYS))
        .add_extension(san, critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                key_encipherment=False,
                key_cert_sign=False,
                key_agreement=True,
                content_commitment=False,
                data_encipherment=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.ExtendedKeyUsage([x509.ExtendedKeyUsageOID.SERVER_AUTH]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )

    KEY_PATH.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            # No passphrase: uvicorn would have to be given it on every start,
            # and the file is gitignored, local, and for development only.
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    CERT_PATH.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))

    try:
        KEY_PATH.chmod(0o600)
    except OSError:
        # Windows ignores POSIX modes; the file still sits in a gitignored
        # directory under the user's own profile.
        pass

    print(f"Wrote {CERT_PATH}")
    print(f"Wrote {KEY_PATH}   (private key — never commit or share this)")
    print("\nValid for: " + ", ".join(described))
    print(f"Expires:   {now + dt.timedelta(days=VALID_DAYS):%Y-%m-%d}")
    print(
        "\nServe the API over TLS with:\n"
        "  uvicorn app.main:app --host 0.0.0.0 --port 8000 \\\n"
        f"    --ssl-keyfile {KEY_PATH} --ssl-certfile {CERT_PATH}\n"
        "\nThis certificate is self-signed: it encrypts, but it does not prove\n"
        "the server's identity. Each device has to trust it once, or click\n"
        "through a warning. Do not use it with real user data."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--host",
        action="append",
        default=[],
        metavar="ADDRESS",
        help=(
            "Extra IP or hostname to include, repeatable. Use this when the "
            "machine has an address this script cannot see — a Tailscale "
            "100.x address, for example."
        ),
    )
    parser.add_argument(
        "--force", action="store_true", help="Overwrite an existing certificate."
    )
    args = parser.parse_args()
    generate(args.host, args.force)


if __name__ == "__main__":
    main()
