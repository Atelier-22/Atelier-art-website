from typing import Any

from fastapi import APIRouter, Depends, status
from firebase_admin import firestore

from .. import cloudinary
from ..firebase import current_admin, db, epoch, jsonable, log_change
from ..schemas import MediaDeleteIn, MediaRecordIn, UploadSignIn
from .public import slugify

router = APIRouter(prefix="/api/admin/media", tags=["media"])


@router.get("")
def media_library(_: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    items = []
    for snap in db().collection("media").stream():
        data = snap.to_dict() or {}
        items.append({"id": snap.id, **jsonable(data), "_created": epoch(data.get("createdAt"))})
    items.sort(key=lambda m: -m.pop("_created"))
    return {"items": items}


@router.post("", status_code=status.HTTP_201_CREATED)
def record_media(body: MediaRecordIn, _: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    doc_id = slugify(body.publicId, "asset")
    ref = db().collection("media").document(doc_id)
    ref.set({
        **body.model_dump(),
        "type": body.resourceType,
        "createdAt": firestore.SERVER_TIMESTAMP,
    }, merge=True)
    return {"id": doc_id, **jsonable(ref.get().to_dict() or {})}


@router.post("/sign")
def sign_upload(body: UploadSignIn, _: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    return cloudinary.upload_signature(body.resourceType, body.uploadPreset, body.folder)


@router.delete("/{media_id}")
def delete_media(media_id: str, body: MediaDeleteIn, user: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    result = cloudinary.destroy(body.publicId, body.resourceType)
    client = db()
    client.collection("media").document(media_id).delete()
    log_change(client, user, "media.delete", media_id, body.publicId)
    return {"ok": True, **result}
