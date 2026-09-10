import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent

load_dotenv(BACKEND_DIR / ".env", override=False)


def _csv(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [part.strip() for part in raw.split(",") if part.strip()]


def _path(name: str, default: Path) -> Path:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    path = Path(raw)
    return path if path.is_absolute() else (BACKEND_DIR / path)


class Settings:
    frontend_dir: Path = _path("FRONTEND_DIR", REPO_DIR / "frontend").resolve()

    firebase_project_id: str = os.getenv("FIREBASE_PROJECT_ID", "alafi-art-website").strip()
    firebase_service_account_file: Path | None = (
        _path("FIREBASE_SERVICE_ACCOUNT_FILE", Path("")) if os.getenv("FIREBASE_SERVICE_ACCOUNT_FILE", "").strip() else None
    )
    firebase_service_account_json: str = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()

    admin_emails: list[str] = [e.lower() for e in _csv("ADMIN_EMAILS", "jonathanalafi@gmail.com,muhwezipetros@gmail.com")]

    cloudinary_cloud_name: str = os.getenv("CLOUDINARY_CLOUD_NAME", "pmhpabd8").strip()
    cloudinary_upload_preset: str = os.getenv("CLOUDINARY_UPLOAD_PRESET", "lpwbmgnq").strip()
    cloudinary_api_key: str = os.getenv("CLOUDINARY_API_KEY", "").strip()
    cloudinary_api_secret: str = os.getenv("CLOUDINARY_API_SECRET", "").strip()

    cors_origins: list[str] = _csv(
        "CORS_ORIGINS",
        "https://alafi-art-work.twendelink.com,http://localhost:8000,http://127.0.0.1:8000",
    )


settings = Settings()
