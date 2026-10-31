from typing import Any
from urllib.parse import quote
from xml.sax.saxutils import escape

from fastapi import APIRouter, Request
from fastapi.responses import Response

from ..firebase import db, firebase_status
from ..settings import settings

router = APIRouter(tags=["public"])

STATIC_PAGES = ["", "gallery.html", "comics.html", "about.html", "contact.html", "privacy.html", "terms.html"]


@router.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "firebase": firebase_status(),
        "cloudinary": {"configured": bool(settings.cloudinary_api_key and settings.cloudinary_api_secret)},
    }


@router.get("/sitemap.xml")
def sitemap(request: Request) -> Response:
    base = settings.public_origin or str(request.base_url).rstrip("/")
    entries = [
        ((snap.to_dict() or {}).get("order", 0), snap.id)
        for snap in db().collection("artCategories").stream()
        if not snap.id.startswith("_")
    ]
    slugs = [slug for _, slug in sorted(entries, key=lambda e: (e[0] if isinstance(e[0], (int, float)) else 0, e[1]))]
    urls = [f"{base}/{page}" for page in STATIC_PAGES]
    urls += [f"{base}/category.html?c={quote(slug)}" for slug in slugs]
    body = "".join(f"  <url><loc>{escape(url)}</loc></url>\n" for url in urls)
    xml = f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}</urlset>\n'
    return Response(xml, media_type="application/xml", headers={"Cache-Control": "no-cache"})
