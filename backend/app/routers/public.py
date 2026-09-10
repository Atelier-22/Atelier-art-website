import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from firebase_admin import firestore

from ..firebase import current_user, db, epoch, firebase_status, jsonable, snapshot_dict
from ..schemas import CommentIn
from ..settings import settings

router = APIRouter(prefix="/api", tags=["public"])

PIECE_COLLECTIONS = ("artworks", "comics")
CATEGORY_KINDS = {"art": "artCategories", "comics": "comicCategories"}


def piece_collection(name: str) -> str:
    if name not in PIECE_COLLECTIONS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    return name


def slugify(value: str | None, fallback: str = "item") -> str:
    slug = re.sub(r"\.[a-z0-9]+$", "", (value or "").lower())
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    return slug or fallback


def normalise_category(doc_id: str, d: dict[str, Any], index: int) -> dict[str, Any]:
    return {
        "id": doc_id,
        "slug": d.get("slug") or doc_id,
        "name": d.get("name") or d.get("label") or doc_id,
        "tagline": d.get("tagline") or "",
        "blurb": d.get("blurb") or "",
        "order": d["order"] if isinstance(d.get("order"), (int, float)) else index,
        "page": d.get("page") or None,
    }


def normalise_artwork(doc_id: str, d: dict[str, Any]) -> dict[str, Any]:
    title = d.get("title")
    return {
        "id": doc_id,
        "category": d.get("category") or "general",
        "title": title or "Untitled",
        "hasTitle": isinstance(title, str) and title.strip() != "",
        "archive": d.get("archive") is True,
        "hidden": d.get("hidden") is True,
        "description": d.get("description") or "",
        "imageUrl": d.get("imageUrl") or "",
        "likes": d.get("likes") or 0,
        "uploaded": d.get("uploaded") is True,
        "publicId": d.get("publicId"),
        "status": d.get("status") or ("published" if d.get("uploaded") is True else "draft"),
        "featured": d.get("featured") is True,
        "order": d["order"] if isinstance(d.get("order"), (int, float)) else 0,
        "createdAt": jsonable(d.get("createdAt")),
        "_created": epoch(d.get("createdAt")),
    }


def normalise_comic(doc_id: str, d: dict[str, Any]) -> dict[str, Any]:
    pages = [p for p in (d.get("pages") or []) if p] if isinstance(d.get("pages"), list) else []
    return {
        "id": doc_id,
        "title": d.get("title") or "Untitled Story",
        "categorySlug": d.get("categorySlug") or "uncategorised",
        "description": d.get("description") or "",
        "coverUrl": d.get("coverUrl") or (pages[0] if pages else ""),
        "pages": pages,
        "likes": d.get("likes") or 0,
        "order": d["order"] if isinstance(d.get("order"), (int, float)) else 0,
        "status": d.get("status") or "published",
        "featured": d.get("featured") is True,
        "coverPublicId": d.get("coverPublicId"),
        "createdAt": jsonable(d.get("createdAt")),
        "_created": epoch(d.get("createdAt")),
    }


def _strip(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for item in items:
        item.pop("_created", None)
    return items


@router.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "firebase": firebase_status(),
        "cloudinary": {"configured": bool(settings.cloudinary_api_key and settings.cloudinary_api_secret)},
    }


@router.get("/config")
def published_config() -> dict[str, Any]:
    snap = db().collection("siteConfig").document("published").get()
    return jsonable(snap.to_dict() or {}) if snap.exists else {}


@router.get("/categories/{kind}")
def categories(kind: str) -> dict[str, Any]:
    if kind not in CATEGORY_KINDS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="kind must be 'art' or 'comics'")
    docs = list(db().collection(CATEGORY_KINDS[kind]).stream())
    items = [normalise_category(s.id, s.to_dict() or {}, i) for i, s in enumerate(docs)]
    items.sort(key=lambda c: (c["order"], c["name"]))
    return {"items": items, "seeded": bool(items)}


@router.get("/artworks")
def artworks(category: str | None = Query(default=None, max_length=80)) -> dict[str, Any]:
    ref = db().collection("artworks").where(filter=firestore.FieldFilter("status", "==", "published"))
    if category:
        ref = ref.where(filter=firestore.FieldFilter("category", "==", category))
    items = [normalise_artwork(s.id, s.to_dict() or {}) for s in ref.stream()]
    items = [a for a in items if a["imageUrl"]]
    items.sort(key=lambda a: (not a["uploaded"], -a["_created"] if a["uploaded"] else a["order"]))
    return {"items": _strip(items)}


@router.get("/artworks/{artwork_id}")
def artwork(artwork_id: str) -> dict[str, Any]:
    snap = db().collection("artworks").document(artwork_id).get()
    data = snap.to_dict() if snap.exists else None
    if not data or data.get("status") != "published":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    return _strip([normalise_artwork(snap.id, data)])[0]


@router.get("/comics")
def comics() -> dict[str, Any]:
    ref = db().collection("comics").where(filter=firestore.FieldFilter("status", "==", "published"))
    items = [normalise_comic(s.id, s.to_dict() or {}) for s in ref.stream()]
    items = [c for c in items if c["coverUrl"] or c["pages"]]
    items.sort(key=lambda c: (c["order"], -c["_created"]))
    return {"items": _strip(items)}


@router.get("/comics/{comic_id}")
def comic(comic_id: str) -> dict[str, Any]:
    snap = db().collection("comics").document(comic_id).get()
    data = snap.to_dict() if snap.exists else None
    if not data or data.get("status") != "published":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    return _strip([normalise_comic(snap.id, data)])[0]


@router.get("/{collection}/{piece_id}/likes")
def likes(collection: str, piece_id: str) -> dict[str, Any]:
    piece_collection(collection)
    snap = db().collection(collection).document(piece_id).get()
    data = snap.to_dict() if snap.exists else {}
    return {"id": piece_id, "likes": (data or {}).get("likes") or 0}


@firestore.transactional
def _bump_likes(transaction: firestore.Transaction, ref: firestore.DocumentReference) -> int:
    snap = ref.get(transaction=transaction)
    if snap.exists:
        current = (snap.to_dict() or {}).get("likes") or 0
        transaction.update(ref, {"likes": firestore.Increment(1)})
        return int(current) + 1
    transaction.set(ref, {"likes": 1, "status": "published", "createdAt": firestore.SERVER_TIMESTAMP})
    return 1


@router.post("/{collection}/{piece_id}/like")
def like(collection: str, piece_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    piece_collection(collection)
    client = db()
    ref = client.collection(collection).document(piece_id)
    total = _bump_likes(client.transaction(), ref)
    return {"id": piece_id, "likes": total, "uid": user.get("uid")}


@router.get("/{collection}/{piece_id}/comments")
def comments(collection: str, piece_id: str) -> dict[str, Any]:
    piece_collection(collection)
    ref = (
        db().collection(collection).document(piece_id).collection("comments")
        .order_by("createdAt", direction=firestore.Query.ASCENDING)
    )
    return {"items": [snapshot_dict(s) for s in ref.stream()]}


@router.post("/{collection}/{piece_id}/comments", status_code=status.HTTP_201_CREATED)
def add_comment(collection: str, piece_id: str, body: CommentIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    piece_collection(collection)
    text = body.text.strip()[:300]
    name = body.name.strip()[:40] or "Guest"
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A comment needs some text.")
    payload = {"name": name, "text": text, "uid": user.get("uid"), "createdAt": firestore.SERVER_TIMESTAMP}
    _, ref = db().collection(collection).document(piece_id).collection("comments").add(payload)
    return snapshot_dict(ref.get())
