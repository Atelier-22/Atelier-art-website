import json
import logging
from datetime import datetime
from typing import Any

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as fb_auth
from firebase_admin import credentials, firestore

from .settings import settings

log = logging.getLogger("alafi.firebase")

_app: firebase_admin.App | None = None
_error: str | None = None


def init_firebase() -> None:
    global _app, _error
    try:
        if settings.firebase_service_account_json:
            cred = credentials.Certificate(json.loads(settings.firebase_service_account_json))
        elif settings.firebase_service_account_file:
            cred = credentials.Certificate(str(settings.firebase_service_account_file))
        else:
            cred = credentials.ApplicationDefault()
            cred.get_credential()
        _app = firebase_admin.initialize_app(cred, {"projectId": settings.firebase_project_id})
        _error = None
        log.info("Firebase Admin ready for project %s", settings.firebase_project_id)
    except Exception as exc:
        _app = None
        _error = f"{type(exc).__name__}: {exc}"
        log.warning("Firebase Admin is not configured; /api routes will answer 503. %s", _error)


def firebase_status() -> dict[str, Any]:
    return {"configured": _app is not None, "project": settings.firebase_project_id, "error": _error}


def db() -> firestore.Client:
    if _app is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Firestore is not configured on this server: {_error}",
        )
    return firestore.client(_app)


_bearer = HTTPBearer(auto_error=False)


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict[str, Any]:
    if _app is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Auth is not configured: {_error}")
    if creds is None or not creds.credentials:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Sign in first.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return fb_auth.verify_id_token(creds.credentials, app=_app)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token ({type(exc).__name__}).",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def is_admin(token: dict[str, Any]) -> bool:
    if token.get("admin") is True:
        return True
    email = (token.get("email") or "").lower()
    return bool(email) and email in settings.admin_emails


def current_admin(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if not is_admin(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Admin privileges required.")
    return user


def jsonable(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    if isinstance(value, firestore.DocumentReference):
        return value.path
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    return value


def epoch(value: Any) -> float:
    return value.timestamp() if isinstance(value, datetime) else 0.0


def snapshot_dict(snap: firestore.DocumentSnapshot) -> dict[str, Any]:
    data = snap.to_dict() or {}
    return {"id": snap.id, **jsonable(data)}


def log_change(client: firestore.Client, actor: dict[str, Any], action: str, resource: str = "", detail: str = "") -> None:
    try:
        client.collection("changeLog").add({
            "action": action,
            "resource": resource or "",
            "detail": detail or "",
            "actor": actor.get("email") or actor.get("uid") or "unknown",
            "via": "api",
            "createdAt": firestore.SERVER_TIMESTAMP,
        })
    except Exception as exc:
        log.warning("changeLog write failed: %s", exc)
