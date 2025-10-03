import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from ..db.database import get_db
from ..models.device_management import DeviceTag, IRPort

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])

logger = logging.getLogger(__name__)


class DeviceTagRequest(BaseModel):
    name: str
    color: Optional[str] = None
    description: Optional[str] = None


class DeviceTagResponse(BaseModel):
    id: int
    name: str
    color: Optional[str]
    description: Optional[str]
    usage_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/tags", response_model=List[DeviceTagResponse])
async def get_device_tags(db: Session = Depends(get_db)):
    """Get all device tags"""
    return db.query(DeviceTag).order_by(DeviceTag.name).all()


@router.post("/tags", response_model=DeviceTagResponse)
async def create_device_tag(tag_request: DeviceTagRequest, db: Session = Depends(get_db)):
    """Create a new device tag"""

    # Check if tag name already exists
    existing = db.query(DeviceTag).filter(DeviceTag.name == tag_request.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tag name already exists")

    # Create new tag
    tag = DeviceTag(
        name=tag_request.name.strip(),
        color=tag_request.color,
        description=tag_request.description,
        usage_count=0
    )

    db.add(tag)
    db.commit()
    db.refresh(tag)

    return tag


@router.put("/tags/{tag_id}", response_model=DeviceTagResponse)
async def update_device_tag(
    tag_id: int,
    tag_request: DeviceTagRequest,
    db: Session = Depends(get_db)
):
    """Update an existing device tag"""

    tag = db.query(DeviceTag).filter(DeviceTag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Check if new name conflicts with existing tag (if name is being changed)
    if tag_request.name != tag.name:
        existing = db.query(DeviceTag).filter(
            DeviceTag.name == tag_request.name,
            DeviceTag.id != tag_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Tag name already exists")

    # Update tag
    tag.name = tag_request.name.strip()
    tag.color = tag_request.color
    tag.description = tag_request.description

    db.commit()
    db.refresh(tag)

    return tag


@router.delete("/tags/{tag_id}")
async def delete_device_tag(tag_id: int, db: Session = Depends(get_db)):
    """Delete a device tag and remove it from all devices"""

    tag = db.query(DeviceTag).filter(DeviceTag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Remove this tag from all IR ports that use it
    ports_with_tag = db.query(IRPort).filter(IRPort.tag_ids.isnot(None)).all()

    for port in ports_with_tag:
        if port.tag_ids and tag_id in port.tag_ids:
            port.tag_ids = [tid for tid in port.tag_ids if tid != tag_id]
            if not port.tag_ids:  # If no tags left, set to None
                port.tag_ids = None

    # Delete the tag
    db.delete(tag)
    db.commit()

    return {"message": f"Tag '{tag.name}' deleted successfully"}


@router.post("/tags/refresh-usage-counts")
async def refresh_tag_usage_counts(db: Session = Depends(get_db)):
    """Refresh usage counts for all tags"""

    tags = db.query(DeviceTag).all()

    for tag in tags:
        # Count how many IR ports use this tag
        count = db.query(IRPort).filter(
            IRPort.tag_ids.isnot(None),
            IRPort.tag_ids.contains([tag.id])
        ).count()

        tag.usage_count = count

    db.commit()

    return {"message": "Tag usage counts refreshed"}