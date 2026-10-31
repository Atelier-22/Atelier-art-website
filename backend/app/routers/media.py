from typing import Any

from fastapi import APIRouter, Depends

from .. import cloudinary
from ..firebase import current_admin, db, log_change
from ..schemas import AssetDestroyIn

router = APIRouter(prefix="/api/admin", tags=["media"])


@router.post("/assets/destroy")
def destroy_asset(body: AssetDestroyIn, user: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    result = cloudinary.destroy(body.publicId, body.resourceType)
    client = db()
    records = list(client.collection("media").where("publicId", "==", body.publicId).stream())
    for record in records:
        record.reference.delete()
    log_change(client, user, "asset.destroy", body.publicId, f"{result['result']}; {len(records)} media records removed")
    return {"ok": True, **result, "mediaRecordsRemoved": len(records)}
