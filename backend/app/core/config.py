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


settings = Settings()
