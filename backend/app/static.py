import os
from pathlib import PurePosixPath

from starlette.staticfiles import StaticFiles

LONG_LIVED = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg", ".ico", ".woff", ".woff2"}


def cache_control_for(path: str) -> str:
    ext = PurePosixPath(path).suffix.lower()
    return "public, max-age=604800" if ext in LONG_LIVED else "no-cache"


class SiteFiles(StaticFiles):
    def lookup_path(self, path: str) -> tuple[str, os.stat_result | None]:
        segments = [part for part in path.replace("\\", "/").split("/") if part]
        if any(part.startswith(".") and part not in (".", "..") for part in segments):
            return "", None
        return super().lookup_path(path)
