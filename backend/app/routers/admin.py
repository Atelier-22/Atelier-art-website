from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from firebase_admin import auth as fb_auth
from firebase_admin import firestore

from ..firebase import current_admin, current_user, db, epoch, is_admin, jsonable, log_change, snapshot_dict
from ..schemas import (
    ArtworkCreate, ArtworkPatch, CategoryCreate, CategoryPatch, ComicCreate, ComicPatch, ConfigDocument, OrderIn,
)
from ..settings import settings
from .public import CATEGORY_KINDS, normalise_artwork, normalise_category, normalise_comic, piece_collection, slugify

router = APIRouter(prefix="/api", tags=["admin"])


def _kind(kind: str) -> str:
    if kind not in CATEGORY_KINDS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="kind must be 'art' or 'comics'")
    return CATEGORY_KINDS[kind]


def _patch(model: Any) -> dict[str, Any]:
    patch = model.model_dump(exclude_unset=True)
    if not patch:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nothing to change.")
    return patch


def _reorder(collection: str, ids: list[str]) -> dict[str, Any]:
    client = db()
    batch = client.batch()
    for i, doc_id in enumerate(ids):
        batch.update(client.collection(collection).document(doc_id), {"order": i})
    batch.commit()
    return {"ok": True, "count": len(ids)}


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


@router.get("/admin/config/draft")
def draft_config(_: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    snap = db().collection("siteConfig").document("draft").get()
    return jsonable(snap.to_dict() or {}) if snap.exists else {}


@router.put("/admin/config/draft")
def save_draft(body: ConfigDocument, user: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    ref = db().collection("siteConfig").document("draft")
    ref.set({**body, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
    return jsonable(ref.get().to_dict() or {})


@router.post("/admin/config/publish")
def publish_draft(user: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    client = db()
    draft = client.collection("siteConfig").document("draft").get()
    payload = draft.to_dict() if draft.exists else {}
    client.collection("siteConfig").document("published").set({**payload, "publishedAt": firestore.SERVER_TIMESTAMP})
    log_change(client, user, "config.publish", "siteConfig/published")
    return jsonable(payload)


@router.post("/admin/config/discard")
def discard_draft(user: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    client = db()
    live = client.collection("siteConfig").document("published").get()
    payload = live.to_dict() if live.exists else {}
    client.collection("siteConfig").document("draft").set({**payload, "updatedAt": firestore.SERVER_TIMESTAMP})
    return jsonable(payload)


@router.post("/categories/{kind}", status_code=status.HTTP_201_CREATED)
def create_category(kind: str, body: CategoryCreate, user: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    path = _kind(kind)
    client = db()
    slug = slugify(body.name, "category")
    ref = client.collection(path).document(slug)
    if ref.get().exists:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=f'A category with the slug "{slug}" already exists.')
    existing = len(list(client.collection(path).stream()))
    ref.set({"slug": slug, "name": body.name.strip(), "tagline": "", "blurb": "", "order": existing,
             "createdAt": firestore.SERVER_TIMESTAMP})
    log_change(client, user, "category.create", f"{path}/{slug}", body.name.strip())
    return normalise_category(slug, ref.get().to_dict() or {}, existing)


@router.patch("/categories/{kind}/{category_id}")
def update_category(kind: str, category_id: str, body: CategoryPatch, user: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    path = _kind(kind)
    ref = db().collection(path).document(category_id)
    if not ref.get().exists:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    ref.update(_patch(body))
    snap = ref.get()
    return normalise_category(snap.id, snap.to_dict() or {}, 0)


@router.delete("/categories/{kind}/{category_id}")
def delete_category(kind: str, category_id: str, user: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    path = _kind(kind)
    client = db()
    client.collection(path).document(category_id).delete()
    log_change(client, user, "category.delete", f"{path}/{category_id}")
    return {"ok": True}


@router.put("/admin/categories/{kind}/order")
def reorder_categories(kind: str, body: OrderIn, _: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    return _reorder(_kind(kind), body.ids)


@router.get("/admin/artworks")
def all_artworks(_: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    items = [normalise_artwork(s.id, s.to_dict() or {}) for s in db().collection("artworks").stream()]
    items.sort(key=lambda a: -a.pop("_created"))
    return {"items": items}


@router.post("/artworks", status_code=status.HTTP_201_CREATED)
def create_artwork(body: ArtworkCreate, user: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    client = db()
    name = (body.title or "Untitled").strip()
    doc_id = f"{body.category}-{slugify(name, 'artwork')}"
    ref = client.collection("artworks").document(doc_id)
    ref.set({
        "category": body.category, "title": name, "description": body.description,
        "imageUrl": body.imageUrl, "publicId": body.publicId, "likes": 0, "status": body.status,
        "featured": False, "order": 0, "createdAt": firestore.SERVER_TIMESTAMP, "uploaded": True,
    }, merge=True)
    log_change(client, user, "artwork.create", doc_id, name)
    item = normalise_artwork(doc_id, ref.get().to_dict() or {})
    item.pop("_created", None)
    return item


@router.patch("/artworks/{artwork_id}")
def update_artwork(artwork_id: str, body: ArtworkPatch, user: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    client = db()
    ref = client.collection("artworks").document(artwork_id)
    if not ref.get().exists:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    patch = _patch(body)
    ref.update(patch)
    if "hidden" in patch:
        log_change(client, user, "archive.hide" if patch["hidden"] else "archive.show", artwork_id)
    if "imageUrl" in patch:
        log_change(client, user, "archive.replace", artwork_id, patch["imageUrl"])
    if "title" in patch:
        log_change(client, user, "artwork.rename", artwork_id, patch["title"] or "(cleared)")
    item = normalise_artwork(artwork_id, ref.get().to_dict() or {})
    item.pop("_created", None)
    return item


@router.delete("/artworks/{artwork_id}")
def delete_artwork(artwork_id: str, user: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    client = db()
    client.collection("artworks").document(artwork_id).delete()
    log_change(client, user, "artwork.delete", artwork_id)
    return {"ok": True}


@router.put("/admin/artworks/order")
def reorder_artworks(body: OrderIn, _: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    return _reorder("artworks", body.ids)


@router.get("/admin/comics")
def all_comics(_: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    items = [normalise_comic(s.id, s.to_dict() or {}) for s in db().collection("comics").stream()]
    items.sort(key=lambda c: (c["order"], -c.pop("_created")))
    return {"items": items}


@router.post("/comics", status_code=status.HTTP_201_CREATED)
def create_comic(body: ComicCreate, user: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    client = db()
    doc_id = slugify(body.title, "story")
    ref = client.collection("comics").document(doc_id)
    if ref.get().exists:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=f'A story called "{body.title}" already exists.')
    count = len(list(client.collection("comics").stream()))
    ref.set({
        "title": body.title.strip(), "categorySlug": body.categorySlug, "description": body.description,
        "coverUrl": body.coverUrl or (body.pages[0] if body.pages else ""), "coverPublicId": body.coverPublicId,
        "pages": body.pages, "likes": 0, "order": count, "status": body.status,
        "createdAt": firestore.SERVER_TIMESTAMP, "updatedAt": firestore.SERVER_TIMESTAMP,
    })
    log_change(client, user, "comic.create", doc_id, body.title.strip())
    item = normalise_comic(doc_id, ref.get().to_dict() or {})
    item.pop("_created", None)
    return item


@router.patch("/comics/{comic_id}")
def update_comic(comic_id: str, body: ComicPatch, user: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    ref = db().collection("comics").document(comic_id)
    if not ref.get().exists:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    ref.update({**_patch(body), "updatedAt": firestore.SERVER_TIMESTAMP})
    item = normalise_comic(comic_id, ref.get().to_dict() or {})
    item.pop("_created", None)
    return item


@router.delete("/comics/{comic_id}")
def delete_comic(comic_id: str, user: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    client = db()
    client.collection("comics").document(comic_id).delete()
    log_change(client, user, "comic.delete", comic_id)
    return {"ok": True}


@router.put("/admin/comics/order")
def reorder_comics(body: OrderIn, _: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    return _reorder("comics", body.ids)


@router.get("/admin/comments")
def all_comments(_: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    items = []
    for snap in db().collection_group("comments").stream():
        parent = snap.reference.parent.parent
        data = snap.to_dict() or {}
        items.append({
            "id": snap.id,
            "parentId": parent.id if parent else "unknown",
            "parentCollection": parent.parent.id if parent is not None and parent.parent is not None else "artworks",
            "name": data.get("name") or "Guest",
            "text": data.get("text") or "",
            "createdAt": jsonable(data.get("createdAt")),
            "_created": epoch(data.get("createdAt")),
        })
    items.sort(key=lambda c: -c.pop("_created"))
    return {"items": items}


@router.delete("/{collection}/{piece_id}/comments/{comment_id}")
def delete_comment(collection: str, piece_id: str, comment_id: str, user: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    piece_collection(collection)
    client = db()
    client.collection(collection).document(piece_id).collection("comments").document(comment_id).delete()
    log_change(client, user, "comment.delete", f"{collection}/{piece_id}/comments/{comment_id}")
    return {"ok": True}


@router.get("/admin/changelog")
def changelog(_: dict[str, Any] = Depends(current_admin)) -> dict[str, Any]:
    ref = (
        db().collection("changeLog")
        .order_by("createdAt", direction=firestore.Query.DESCENDING)
        .limit(200)
    )
    return {"items": [snapshot_dict(s) for s in ref.stream()]}
