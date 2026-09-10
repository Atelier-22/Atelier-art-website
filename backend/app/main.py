import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .firebase import init_firebase
from .routers import admin, media, public
from .settings import settings
from .static import SiteFiles, cache_control_for

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("alafi")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not settings.frontend_dir.is_dir():
        raise RuntimeError(f"FRONTEND_DIR does not exist: {settings.frontend_dir}")
    log.info("Serving %s", settings.frontend_dir)
    init_firebase()
    yield


app = FastAPI(
    title="Alafi Art Work API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    swagger_ui_oauth2_redirect_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/") or path == "/api":
        response.headers.setdefault("Cache-Control", "no-store")
    else:
        response.headers["Cache-Control"] = cache_control_for(path)
    return response


app.include_router(public.router)
app.include_router(admin.router)
app.include_router(media.router)


@app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
def api_not_found(rest: str) -> JSONResponse:
    return JSONResponse({"detail": "Not found"}, status_code=404)


app.mount("/", SiteFiles(directory=str(settings.frontend_dir), html=True), name="site")
