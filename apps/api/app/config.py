from functools import lru_cache
from urllib.parse import urlparse

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str | None = None
    supabase_url: str | None = None
    supabase_jwt_audience: str = "authenticated"
    storage_service_key: SecretStr | None = None
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @field_validator("database_url")
    @classmethod
    def postgres_only(cls, value: str | None) -> str | None:
        if value and not value.startswith("postgresql+psycopg://"):
            raise ValueError("DATABASE_URL must use postgresql+psycopg://")
        return value

    @field_validator("supabase_url")
    @classmethod
    def secure_auth_url(cls, value: str | None) -> str | None:
        if value:
            parsed = urlparse(value)
            local = parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}
            if (parsed.scheme != "https" and not local) or not parsed.hostname or parsed.username:
                raise ValueError(
                    "SUPABASE_URL requires HTTPS, or HTTP on loopback for local Supabase"
                )
            if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
                raise ValueError("SUPABASE_URL must not contain a path, query or fragment")
            return value.rstrip("/")
        return value

    @property
    def issuer(self) -> str | None:
        return f"{self.supabase_url}/auth/v1" if self.supabase_url else None


@lru_cache
def get_settings() -> Settings:
    return Settings()
