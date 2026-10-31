from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from firebase_admin import auth as fb_auth

from ..firebase import current_user, is_admin
from ..settings import settings

router = APIRouter(prefix="/api", tags=["admin"])


@router.get("/me")
def me(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {
        "uid": user.get("uid"),
        "email": user.get("email"),
        "anonymous": user.get("firebase", {}).get("sign_in_provider") == "anonymous",
        "admin": is_admin(user),
    }


@router.post("/admin/claim")
def grant_admin_claim(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    email = (user.get("email") or "").lower()
    if not email or email not in settings.admin_emails:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="This account is not an owner account.")
    fb_auth.set_custom_user_claims(user["uid"], {"admin": True})
    return {"uid": user["uid"], "email": email, "admin": True,
            "note": "Sign out and back in (or refresh the ID token) for the claim to take effect."}
