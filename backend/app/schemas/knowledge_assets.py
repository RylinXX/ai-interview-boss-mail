from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.models import KnowledgeAssetReviewStatus


class KnowledgeAssetIntakeRequest(BaseModel):
    title: str
    source_type: str = "manual_note"
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    source_file_path: Optional[str] = None
    source_confidentiality: str = "internal"
    source_document_id: Optional[str] = None
    chunk_index: int = 0
    chunk_total: int = 1
    source_page: Optional[int] = None
    source_section: Optional[str] = None
    source_locator: Optional[str] = None
    source_excerpt: Optional[str] = None
    retrieval_metadata: Dict[str, Any] = {}
    raw_text: str
    industry_tags: List[str] = []
    business_topic_tags: List[str] = []
    scenario_tags: List[str] = []
    evidence_type_tags: List[str] = []
    capability_tags: List[str] = []
    methodology_tags: List[str] = []
    customer_type_tags: List[str] = []
    value_tags: List[str] = []


class KnowledgeAssetReviewUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    industry_tags: Optional[List[str]] = None
    business_topic_tags: Optional[List[str]] = None
    scenario_tags: Optional[List[str]] = None
    evidence_type_tags: Optional[List[str]] = None
    capability_tags: Optional[List[str]] = None
    methodology_tags: Optional[List[str]] = None
    customer_type_tags: Optional[List[str]] = None
    value_tags: Optional[List[str]] = None
    proves: Optional[List[str]] = None
    does_not_prove: Optional[List[str]] = None
    applicable_conditions: Optional[List[str]] = None
    migration_risks: Optional[List[str]] = None
    evidence_strength_score: Optional[float] = None
    data_verification_score: Optional[float] = None
    commercial_value_score: Optional[float] = None
    relevance_score: Optional[float] = None
    confidence_score: Optional[float] = None
    confidence_reason: Optional[str] = None
    manual_review_status: Optional[KnowledgeAssetReviewStatus] = None


class KnowledgeAssetResponse(BaseModel):
    id: UUID
    title: str
    source_type: str
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    source_file_path: Optional[str] = None
    source_resume_id: Optional[UUID] = None
    source_confidentiality: str = "internal"
    source_document_id: Optional[str] = None
    chunk_index: Optional[int] = 0
    chunk_total: Optional[int] = 1
    source_page: Optional[int] = None
    source_section: Optional[str] = None
    source_locator: Optional[str] = None
    source_excerpt: Optional[str] = None
    retrieval_metadata: Optional[Dict[str, Any]] = {}
    citation_id: Optional[str] = None
    source_payload: Dict[str, Any] = {}
    raw_text: Optional[str] = None
    summary: Optional[str] = None
    industry_tags: List[str] = []
    business_topic_tags: List[str] = []
    scenario_tags: List[str] = []
    evidence_type_tags: List[str] = []
    capability_tags: List[str] = []
    methodology_tags: List[str] = []
    customer_type_tags: List[str] = []
    value_tags: List[str] = []
    proves: List[str] = []
    does_not_prove: List[str] = []
    applicable_conditions: List[str] = []
    migration_risks: List[str] = []
    evidence_strength_score: float = 0.0
    data_verification_score: float = 0.0
    commercial_value_score: float = 0.0
    relevance_score: float = 0.0
    confidence_score: float = 0.0
    confidence_reason: Optional[str] = None
    manual_review_status: KnowledgeAssetReviewStatus
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class KnowledgeAssetListResponse(BaseModel):
    items: List[KnowledgeAssetResponse]
    total: int
    industry_tags: List[str] = []
    business_topic_tags: List[str] = []
    evidence_type_tags: List[str] = []
    metrics: Dict[str, int] = Field(default_factory=dict)


class KnowledgeAssetSearchRequest(BaseModel):
    query: str
    industry_tags: List[str] = []
    business_topic_tags: List[str] = []
    evidence_type_tags: List[str] = []
    limit: int = 8


class RetrievedKnowledgeAsset(BaseModel):
    asset: KnowledgeAssetResponse
    match_score: float
    match_reason: str


class KnowledgeAssetSearchResponse(BaseModel):
    query: str
    items: List[RetrievedKnowledgeAsset]
    retrieval_log: Dict[str, Any] = {}


class AIProductManagerDraftRequest(BaseModel):
    demand: str
    company_profile: Optional[str] = None
    constraints: Optional[str] = None
    confirmed_context: Dict[str, Any] = {}
    limit: int = 8


class AIProductManagerDraftResponse(BaseModel):
    demand_understanding: str
    evidence_summary: List[str] = []
    solution_hypotheses: List[Dict[str, Any]] = []
    missing_questions: List[str] = []
    human_confirmation_points: List[str] = []
    next_workflow: List[str] = []
    cited_assets: List[RetrievedKnowledgeAsset] = []
    model_used: bool = False
    fallback_used: bool = False


class SolutionAgentRequest(BaseModel):
    conversation_id: Optional[UUID] = None
    requirement: str
    company_profile: Optional[str] = None
    project_materials: Optional[str] = None
    constraints: Optional[str] = None
    confirmed_context: Dict[str, Any] = {}
    limit: int = 8


class SolutionAgentResponse(BaseModel):
    conversation_id: Optional[UUID] = None
    run_id: Optional[UUID] = None
    user_message_id: Optional[UUID] = None
    assistant_message_id: Optional[UUID] = None
    assistant_message: str
    solution: Dict[str, Any]
    retrieved_evidence: List[Dict[str, Any]] = []
    dynamic_workers: List[Dict[str, Any]] = []
    human_decision_points: List[str] = []
    evidence_self_check: Dict[str, Any] = {}
    unsupported_claims: List[Dict[str, Any]] = []
    agent_trace: List[Dict[str, Any]] = []
    crew_trace: List[Dict[str, Any]] = []
    retrieval_log: Dict[str, Any] = {}
    evidence_coverage: Dict[str, Any] = {}
    clarifying_questions: List[str] = []
    next_actions: List[str] = []
    model_used: bool = False
    fallback_used: bool = False
