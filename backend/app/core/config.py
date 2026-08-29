from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central app config, loaded from environment variables / .env.

    NOTE: no field here should ever hold a real secret in source control.
    See backend/.env.example for the local dev template.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "local"

    database_url: str = "postgresql://medhelp:medhelp@localhost:5432/medhelp_dev"

    jwt_secret_key: str = "dev-only-placeholder-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

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


settings = Settings()
