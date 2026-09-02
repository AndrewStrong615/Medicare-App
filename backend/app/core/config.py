import logging
import secrets

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# The value shipped in .env.example. It is public — it is in source control and
# in every copy of this repository — so a deployment still using it has, in
# effect, no signing key at all: anyone who has read the repo can mint a token
# for any user id and read that person's medications, appointments and intake
# assessments. Every per-user filter in app/api rests on this one secret.
PLACEHOLDER_JWT_SECRET = "dev-only-placeholder-secret-change-me"

# 256 bits, the output size of the HMAC this key feeds. Shorter keys are the
# ones that get brute-forced offline from a single captured token.
MIN_JWT_SECRET_LENGTH = 32

# Environments where a weak secret is downgraded to a warning plus an ephemeral
# random key, rather than a refusal to boot. Anything else is treated as
# capable of holding real user data.
NON_PRODUCTION_ENVIRONMENTS = {"local", "dev", "development", "test", "testing"}

# HS256 is the only algorithm this app signs or verifies with, and it is
# deliberately NOT read from the environment. An algorithm that an operator —
# or anything that can write the environment — can change is the setup that
# algorithm-confusion attacks need, and "none" in particular turns every token
# into a forgeable one.
JWT_ALGORITHM = "HS256"

# Claim values checked on every token. A token minted for something else, or by
# something else, is rejected even if it is signed with the right key.
JWT_ISSUER = "medhelp-api"
JWT_AUDIENCE = "medhelp-app"


class Settings(BaseSettings):
    """
    Central app config, loaded from environment variables / .env.

    NOTE: no field here should ever hold a real secret in source control.
    See backend/.env.example for the local dev template.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "local"

    database_url: str = "postgresql://medhelp:medhelp@localhost:5432/medhelp_dev"

    # ⛔ Must be replaced before this runs anywhere but a dev machine. Boot
    # fails outside a development environment if it is still the placeholder or
    # is shorter than MIN_JWT_SECRET_LENGTH. Generate one with:
    #     python -c "import secrets; print(secrets.token_hex(32))"
    jwt_secret_key: str = PLACEHOLDER_JWT_SECRET
    access_token_expire_minutes: int = 60

    # Origins allowed to call this API from a browser, comma-separated.
    #
    # This used to be "*" unconditionally, which meant any web page the user
    # had open could call the API. It is an explicit allowlist now, and "*" is
    # refused outright outside a development environment. The default covers
    # the Expo web dev server on its usual ports.
    cors_allow_origins: str = (
        "http://localhost:8081,http://127.0.0.1:8081,"
        "http://localhost:8082,http://127.0.0.1:8082,"
        "http://localhost:19006,http://127.0.0.1:19006"
    )

    # Also allow any loopback/private/LAN origin while developing. This is what
    # keeps http://192.168.1.5:8081 working without editing .env every time the
    # network changes. Ignored entirely outside a development environment.
    cors_allow_private_origins: bool = True

    # Serve /docs, /redoc and /openapi.json. Off outside development: an
    # unauthenticated, machine-readable map of every route and every field is
    # free reconnaissance, and this API has no public consumers.
    enable_api_docs: bool = True

    # Largest request body the API will read, in bytes. Per-field limits live
    # on the pydantic schemas; this is the outer bound that stops an oversized
    # body being buffered at all.
    max_request_body_bytes: int = 256 * 1024

    # Failed sign-in attempts allowed from one client address per window, and
    # the window in seconds. See app/core/rate_limit.py for what this does and
    # does not protect against.
    auth_rate_limit_attempts: int = 10
    auth_rate_limit_window_seconds: int = 300

    # NOTE: symptom intake is deliberately NOT rate limited. A 429 on
    # POST /intake/assess is a refusal to screen someone who may be describing
    # chest pain, and emergency guidance is the one thing this app must never
    # withhold (see CLAUDE.md, "Emergency routing"). The cost exposure that
    # argues for a limit there is real, so the limit belongs at a reverse proxy
    # that can be tuned by someone who has read the safety architecture — not
    # bolted on here.

    # Used by the symptom-intake triage classifier. Empty means the intake
    # feature reports itself unavailable — it never falls back to guessing.
    anthropic_api_key: str = ""

    # ⛔ OFF pending clinician review. Do not flip this without reading the
    # note in CLAUDE.md under "Related reading is gated off".
    #
    # When true, intake attaches MedlinePlus topics matched to the words the
    # user wrote. The matching is lexical, and a topic that merely shares a
    # word can be alarming and unrelated: "my head has been pounding" returns
    # "Head and Neck Cancer". Beside a person's own description that reads as
    # a suggested diagnosis, which is exactly what this app may not do.
    #
    # While false, no MedlinePlus request is made at all — so no symptom text
    # reaches NLM either, which moots that vendor's BAA question for as long
    # as this stays off.
    medlineplus_topics_enabled: bool = False

    # Writes each classification — including the description — to the
    # application log, so classifier quality can be reviewed while tuning.
    #
    # ⛔ SYNTHETIC DATA ONLY. Descriptions are health data, and CLAUDE.md
    # forbids logging them. `app.core.triage_log` refuses to honour this flag
    # when environment == "production", but that check protects one
    # deployment name, not you: never switch this on anywhere a real user has
    # typed into the app.
    triage_log_classifications: bool = False

    @property
    def is_development(self) -> bool:
        return self.environment.strip().lower() in NON_PRODUCTION_ENVIRONMENTS

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip().rstrip("/")
            for origin in self.cors_allow_origins.split(",")
            if origin.strip()
        ]

    @model_validator(mode="after")
    def _enforce_signing_key(self) -> "Settings":
        """
        Fail closed on a weak signing key, and never silently keep a public one.

        Outside development this raises at import, so the process does not come
        up at all. That is deliberate: a health API that boots with a published
        signing key is worse than one that does not boot, because nothing about
        it looks wrong from the outside.

        In development the key is replaced with a fresh random one rather than
        left as the published string. Sessions then stop working across a
        restart, which is a mild annoyance and the right trade — it means no
        running copy of this app anywhere accepts a token signed with the value
        printed in .env.example.
        """
        secret = (self.jwt_secret_key or "").strip()
        weak = secret == PLACEHOLDER_JWT_SECRET or len(secret) < MIN_JWT_SECRET_LENGTH

        if not weak:
            return self

        if not self.is_development:
            raise ValueError(
                "JWT_SECRET_KEY is unset, too short, or still the placeholder "
                "from .env.example. Set a secret of at least "
                f"{MIN_JWT_SECRET_LENGTH} characters before running with "
                f"ENVIRONMENT={self.environment!r}. Generate one with: "
                "python -c \"import secrets; print(secrets.token_hex(32))\""
            )

        object.__setattr__(self, "jwt_secret_key", secrets.token_hex(32))
        logger.warning(
            "JWT_SECRET_KEY was missing, too short, or the published "
            "placeholder. A random one was generated for this process only, so "
            "sessions will not survive a restart. Set a real JWT_SECRET_KEY in "
            "backend/.env. The API REFUSES TO START with a weak secret when "
            "ENVIRONMENT is not one of: %s.",
            ", ".join(sorted(NON_PRODUCTION_ENVIRONMENTS)),
        )
        return self

    @model_validator(mode="after")
    def _enforce_cors(self) -> "Settings":
        """A wildcard origin is a development-only convenience."""
        if "*" in self.cors_origin_list and not self.is_development:
            raise ValueError(
                "CORS_ALLOW_ORIGINS may not contain '*' when ENVIRONMENT is "
                f"{self.environment!r}. List the exact origins that serve the "
                "app instead."
            )
        return self


settings = Settings()
