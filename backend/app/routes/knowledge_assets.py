from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.models.models import User
from app.routes.auth import get_current_user
from app.schemas.knowledge_assets import (
    KnowledgeAssetIntakeRequest,
    KnowledgeAssetListResponse,
    KnowledgeAssetResponse,
    KnowledgeAssetReviewUpdate,
)
from app.services import knowledge_asset_service as service


router = APIRouter(tags=["knowledge-assets"])


@router.get("/knowledge-assets", response_model=KnowledgeAssetListResponse)
def list_knowledge_assets_route(
    query: Optional[str] = None,
    industry: Optional[str] = None,
    topic: Optional[str] = None,
    evidence_type: Optional[str] = None,
    review_status: Optional[str] = None,
    source_type: Optional[str] = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_assets(db, query, industry, topic, evidence_type, review_status, source_type, limit)


@router.post("/knowledge-assets/intake", response_model=KnowledgeAssetResponse)
def create_knowledge_asset_route(
    payload: KnowledgeAssetIntakeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_manual_asset(db, payload, current_user.id)


@router.get("/knowledge-assets/{asset_id}", response_model=KnowledgeAssetResponse)
def get_knowledge_asset_route(
    asset_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = service.get_asset(db, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Knowledge asset not found")
    return asset


@router.put("/knowledge-assets/{asset_id}/review", response_model=KnowledgeAssetResponse)
def review_knowledge_asset_route(
    asset_id: UUID,
    payload: KnowledgeAssetReviewUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = service.update_asset_review(db, asset_id, payload)
    if not asset:
        raise HTTPException(status_code=404, detail="Knowledge asset not found")
    return asset
