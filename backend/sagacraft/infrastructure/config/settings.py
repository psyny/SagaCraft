"""All settings come from environment variables (see backend/.env.example)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str = "postgresql://sagacraft:sagacraft@localhost:5432/sagacraft"
    cors_origins: str = "http://localhost:3000"

    # Signs login tokens, file URLs and the discrete-threshold seeds. Must be secret in production.
    jwt_secret_key: str = "dev-secret-change-me-in-production-0123456789"
    token_hours: int = 24 * 14
    file_url_minutes: int = 120
    # Picture URLs stay the same for this window (cached by browsers and CDNs); each works file_url_minutes past it
    file_url_window_hours: int = 6

    # Created on startup when the instance has no system admin yet.
    root_admin_login: str = ""
    root_admin_password: str = ""

    # Hard ceiling for any upload; per-category limits (system settings) can't exceed it.
    max_upload_mb: float = 20

    @property
    def sqlalchemy_url(self) -> str:
        # Railway gives postgres://; SQLAlchemy wants postgresql://
        url = self.database_url
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


settings = Settings()
