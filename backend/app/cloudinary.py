import hashlib
import time
from typing import Any

import httpx
from fastapi import HTTPException, status

from .settings import settings


def _require_keys() -> None:
    if not settings.cloudinary_api_key or not settings.cloudinary_api_secret:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloudinary API key and secret are not configured on this server.",
        )


def sign(params: dict[str, Any]) -> str:
    to_sign = "&".join(f"{k}={params[k]}" for k in sorted(params) if params[k] not in (None, ""))
    return hashlib.sha1((to_sign + settings.cloudinary_api_secret).encode("utf-8")).hexdigest()


def upload_signature(resource_type: str = "image", upload_preset: str | None = None, folder: str | None = None) -> dict[str, Any]:
    _require_keys()
    params: dict[str, Any] = {"timestamp": int(time.time())}
    if upload_preset:
        params["upload_preset"] = upload_preset
    if folder:
        params["folder"] = folder
    return {
        **params,
        "signature": sign(params),
        "api_key": settings.cloudinary_api_key,
        "cloud_name": settings.cloudinary_cloud_name,
        "resource_type": resource_type,
        "upload_url": f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/{resource_type}/upload",
    }


def destroy(public_id: str, resource_type: str = "image") -> dict[str, Any]:
    _require_keys()
    if resource_type not in ("image", "video", "raw"):
        resource_type = "image"
    params = {"public_id": public_id, "timestamp": int(time.time())}
    body = {**params, "api_key": settings.cloudinary_api_key, "signature": sign(params)}
    url = f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/{resource_type}/destroy"

    try:
        res = httpx.post(url, data=body, timeout=30)
    except httpx.HTTPError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=f"Cloudinary unreachable: {exc}") from exc

    try:
        payload = res.json()
    except ValueError:
        payload = {}
    if res.status_code >= 300:
        message = (payload.get("error") or {}).get("message", "unknown error")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=f"Cloudinary returned {res.status_code}: {message}")
    result = payload.get("result")
    if result not in ("ok", "not found"):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=f"Cloudinary refused the delete: {result}")
    return {"publicId": public_id, "result": result}
