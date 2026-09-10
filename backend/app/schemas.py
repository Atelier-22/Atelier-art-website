from typing import Any, Literal

from pydantic import BaseModel, Field

Status = Literal["draft", "published", "archived"]
ResourceType = Literal["image", "video", "raw"]


class CommentIn(BaseModel):
    name: str = Field(default="", max_length=200)
    text: str = Field(min_length=1, max_length=2000)


class OrderIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class CategoryPatch(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    tagline: str | None = Field(default=None, max_length=200)
    blurb: str | None = Field(default=None, max_length=1000)
    page: str | None = Field(default=None, max_length=200)
    order: int | None = None


class ArtworkCreate(BaseModel):
    category: str = Field(min_length=1, max_length=80)
    title: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=4000)
    imageUrl: str = Field(min_length=1, max_length=2000)
    publicId: str | None = Field(default=None, max_length=500)
    status: Status = "published"


class ArtworkPatch(BaseModel):
    category: str | None = Field(default=None, max_length=80)
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    imageUrl: str | None = Field(default=None, max_length=2000)
    publicId: str | None = Field(default=None, max_length=500)
    status: Status | None = None
    featured: bool | None = None
    hidden: bool | None = None
    archive: bool | None = None
    order: int | None = None


class ComicCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    categorySlug: str = Field(default="uncategorised", max_length=80)
    description: str = Field(default="", max_length=4000)
    coverUrl: str = Field(default="", max_length=2000)
    coverPublicId: str | None = Field(default=None, max_length=500)
    pages: list[str] = Field(default_factory=list, max_length=500)
    status: Status = "published"


class ComicPatch(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    categorySlug: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=4000)
    coverUrl: str | None = Field(default=None, max_length=2000)
    coverPublicId: str | None = Field(default=None, max_length=500)
    pages: list[str] | None = Field(default=None, max_length=500)
    status: Status | None = None
    featured: bool | None = None
    order: int | None = None


class MediaRecordIn(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    publicId: str = Field(min_length=1, max_length=500)
    resourceType: ResourceType = "image"
    format: str | None = None
    bytes: int | None = None
    width: int | None = None
    height: int | None = None
    duration: float | None = None
    filename: str = Field(default="", max_length=300)
    usedFor: str = Field(default="unknown", max_length=60)


class MediaDeleteIn(BaseModel):
    publicId: str = Field(min_length=1, max_length=500)
    resourceType: ResourceType = "image"


class UploadSignIn(BaseModel):
    resourceType: ResourceType = "image"
    uploadPreset: str | None = Field(default=None, max_length=100)
    folder: str | None = Field(default=None, max_length=200)


ConfigDocument = dict[str, Any]
