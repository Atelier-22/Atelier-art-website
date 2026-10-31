import os

from starlette.staticfiles import StaticFiles


def cache_control_for(path: str) -> str:
    return "no-cache"


class SiteFiles(StaticFiles):
    def lookup_path(self, path: str) -> tuple[str, os.stat_result | None]:
        segments = [part for part in path.replace("\\", "/").split("/") if part]
        if any(part.startswith(".") and part not in (".", "..") for part in segments):
            return "", None
        return super().lookup_path(path)
