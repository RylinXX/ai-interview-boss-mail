from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.models.models import Resume, User
from app.routes.auth import get_current_user
from app.schemas.knowledge_assets import (
    AIProductManagerDraftRequest,
    AIProductManagerDraftResponse,
    KnowledgeAssetIntakeRequest,
    KnowledgeAssetListResponse,
    KnowledgeAssetResponse,
    KnowledgeAssetReviewUpdate,
    KnowledgeAssetSearchRequest,
    KnowledgeAssetSearchResponse,
    SolutionAgentRequest,
    SolutionAgentResponse,
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


@router.post("/knowledge-assets/upload", response_model=KnowledgeAssetListResponse)
def upload_knowledge_asset_route(
    file: UploadFile = File(...),
    title: str = Form(...),
    source_type: str = Form("manual_note"),
    source_name: Optional[str] = Form(None),
    source_url: Optional[str] = Form(None),
    source_confidentiality: str = Form("internal"),
    industry_tags: Optional[str] = Form(None),
    business_topic_tags: Optional[str] = Form(None),
    scenario_tags: Optional[str] = Form(None),
    evidence_type_tags: Optional[str] = Form(None),
    capability_tags: Optional[str] = Form(None),
    methodology_tags: Optional[str] = Form(None),
    customer_type_tags: Optional[str] = Form(None),
    value_tags: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    assets = service.create_assets_from_upload(
        db,
        file,
        title=title,
        source_type=source_type,
        source_name=source_name,
        source_url=source_url,
        source_confidentiality=source_confidentiality,
        industry_tags=industry_tags,
        business_topic_tags=business_topic_tags,
        scenario_tags=scenario_tags,
        evidence_type_tags=evidence_type_tags,
        capability_tags=capability_tags,
        methodology_tags=methodology_tags,
        customer_type_tags=customer_type_tags,
        value_tags=value_tags,
        user_id=current_user.id,
    )
    return {
        "items": assets,
        "total": len(assets),
        "industry_tags": sorted({tag for asset in assets for tag in (asset.industry_tags or [])}),
        "business_topic_tags": sorted({tag for asset in assets for tag in (asset.business_topic_tags or [])}),
        "evidence_type_tags": sorted({tag for asset in assets for tag in (asset.evidence_type_tags or [])}),
    }


@router.post("/resumes/{resume_id}/knowledge-assets/sync", response_model=KnowledgeAssetListResponse)
def sync_resume_assets_route(
    resume_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    assets = service.sync_resume_knowledge_assets(db, resume)
    return {
        "items": assets,
        "total": len(assets),
        "industry_tags": sorted({tag for asset in assets for tag in (asset.industry_tags or [])}),
        "business_topic_tags": sorted({tag for asset in assets for tag in (asset.business_topic_tags or [])}),
        "evidence_type_tags": sorted({tag for asset in assets for tag in (asset.evidence_type_tags or [])}),
    }


@router.post("/knowledge-assets/search", response_model=KnowledgeAssetSearchResponse)
def search_knowledge_assets_route(
    payload: KnowledgeAssetSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.search_assets(db, payload)


@router.post("/ai-product-manager/draft", response_model=AIProductManagerDraftResponse)
def generate_ai_product_manager_draft_route(
    payload: AIProductManagerDraftRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.generate_controlled_product_manager_draft(db, payload)


@router.post("/solution-agent/generate", response_model=SolutionAgentResponse)
def generate_solution_agent_route(
    payload: SolutionAgentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.generate_solution_agent(db, payload)


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
