import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.models.models import Resume, User
from app.routes.auth import get_current_user
from app.schemas.knowledge_assets import (
    AIProductManagerDraftRequest,
    AIProductManagerDraftResponse,
    KnowledgeAssetIntakeRequest,
    KnowledgeAssetListResponse,
    KnowledgeAssetPageResponse,
    KnowledgeAssetResponse,
    KnowledgeAssetReviewUpdate,
    KnowledgeAssetSearchRequest,
    KnowledgeAssetSearchResponse,
    SolutionAgentRequest,
    SolutionAgentResponse,
)
from app.services import knowledge_asset_service as service


router = APIRouter(tags=["knowledge-assets"])


@router.get("/knowledge-assets", response_model=KnowledgeAssetPageResponse)
@router.get("/knowledge-assets/query", response_model=KnowledgeAssetPageResponse)
def list_knowledge_assets_route(
    q: Optional[str] = None,
    query: Optional[str] = None,
    industry_tag: Optional[str] = None,
    industry: Optional[str] = None,
    topic_tag: Optional[str] = None,
    topic: Optional[str] = None,
    evidence_type: Optional[str] = None,
    review_status: Optional[str] = None,
    source_type: Optional[str] = None,
    skip: int = Query(default=0, ge=0),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    search_q = q or query
    search_ind = industry_tag or industry
    search_top = topic_tag or topic
    search_off = skip or offset
    return service.list_assets(
        db,
        query=search_q,
        industry=search_ind,
        topic=search_top,
        evidence_type=evidence_type,
        review_status=review_status,
        source_type=source_type,
        limit=limit,
        offset=search_off,
    )


@router.get("/knowledge-assets/taxonomy/stats")
def get_knowledge_asset_taxonomy_stats_route(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_taxonomy_stats(db)


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
    return service.generate_solution_agent(db, payload, current_user.id)


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(jsonable_encoder(data), ensure_ascii=False)}\n\n"


@router.post("/solution-agent/stream")
def stream_solution_agent_route(
    payload: SolutionAgentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    def event_generator():
        yield _sse_event("start", {"status": "started", "requirement": payload.requirement})
        result = service.generate_solution_agent(db, payload, current_user.id)
        for index, step in enumerate(result.get("crew_trace") or result.get("agent_trace") or [], start=1):
            yield _sse_event("trace", {"index": index, **step})
        yield _sse_event("done", result)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/solution-agent/conversations")
def list_solution_agent_conversations_route(
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_solution_agent_conversations(db, current_user.id, limit)


@router.get("/solution-agent/conversations/{conversation_id}/messages")
def get_solution_agent_messages_route(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_solution_agent_messages(db, current_user.id, conversation_id)


@router.delete("/solution-agent/conversations/{conversation_id}")
def delete_solution_agent_conversation_route(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.delete_solution_agent_conversation(db, current_user.id, conversation_id)


@router.get("/solution-agent/runs/{run_id}")
def get_solution_agent_run_route(
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_solution_agent_run(db, current_user.id, run_id)


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
