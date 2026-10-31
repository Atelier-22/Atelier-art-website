from typing import Literal

from pydantic import BaseModel, Field

ResourceType = Literal["image", "video", "raw"]


class AssetDestroyIn(BaseModel):
    publicId: str = Field(min_length=1, max_length=500)
    resourceType: ResourceType = "image"
