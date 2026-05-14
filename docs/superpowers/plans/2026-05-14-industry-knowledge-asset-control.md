# Industry Knowledge Asset Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first controlled data layer for the `行业知识资产库 + AI 产品经理方案台`: normalized knowledge assets, tag review, resume-derived asset sync, demand-driven retrieval, and controlled solution drafts.

**Architecture:** Add a dedicated knowledge-asset domain beside the existing business workbench. Keep current resume parsing and customer-project flows intact, but derive normalized knowledge assets from resume projects and manually entered materials; the AI product manager reads only this controlled asset layer when drafting solution hypotheses.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy, Pydantic v2, pytest, React 19, React Router, Ant Design, Vite

---

## File Structure

- `backend/app/models/models.py`: add the persistent `KnowledgeAsset` model and review-status enum.
- `backend/app/schemas/knowledge_assets.py`: request and response schemas for assets, tag review, intake, retrieval, and AI product manager drafts.
- `backend/app/services/knowledge_asset_service.py`: normalize source material, create assets, update human-reviewed tags, sync resume-derived assets, retrieve assets, and build controlled draft payloads.
- `backend/app/routes/knowledge_assets.py`: API surface for asset library, intake, review, resume sync, retrieval, and AI product manager drafts.
- `backend/app/services/ai_service.py`: add optional LLM helpers for asset tagging and AI product manager draft generation, with deterministic service-level fallback.
- `backend/app/utils/prompt_manager.py`: add prompt defaults for knowledge asset tagging and controlled AI product manager drafts.
- `backend/app/config/prompt_variables.py`: expose prompt variables for the two new prompts.
- `backend/app/main.py`: include the new router before the existing business-workbench router so `/api/knowledge-assets` resolves to the asset library.
- `backend/tests/conftest.py`: create/drop `KnowledgeAsset.__table__` and include the new router in test apps.
- `backend/tests/test_knowledge_assets.py`: backend coverage for model/API behavior, resume sync, retrieval, and controlled drafts.
- `frontend/src/router/index.tsx`: add routes for data intake, asset detail, and AI product manager.
- `frontend/src/components/Layout/index.tsx`: change navigation to `行业知识资产库`, `数据入库`, and `AI 产品经理`.
- `frontend/src/pages/KnowledgeAssets/index.tsx`: replace the current overview with the asset library table.
- `frontend/src/pages/KnowledgeAssets/Detail.tsx`: add asset detail and review controls.
- `frontend/src/pages/KnowledgeAssets/Intake.tsx`: add manual data intake form.
- `frontend/src/pages/AIProductManager/index.tsx`: add demand-driven draft workbench.
- `frontend/src/pages/BusinessWorkbench.css`: reuse and extend existing workbench classes for dense data-control UI.

---

### Task 1: Backend Knowledge Asset Domain

**Files:**
- Modify: `backend/app/models/models.py`
- Create: `backend/app/schemas/knowledge_assets.py`
- Create: `backend/app/services/knowledge_asset_service.py`
- Create: `backend/app/routes/knowledge_assets.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_knowledge_assets.py`

- [ ] **Step 1: Write the failing route test**

Create `backend/tests/test_knowledge_assets.py`:

```python
from uuid import uuid4


def test_manual_intake_creates_reviewable_knowledge_asset(client, admin_auth_headers):
    response = client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "工程招投标平台案例",
            "source_type": "company_case",
            "source_name": "内部访谈",
            "source_url": "https://example.com/bidding",
            "raw_text": "某工程咨询公司通过投标资料模板库、人员资质库和流程审批系统提升投标文件制作效率。",
            "industry_tags": ["工程建设"],
            "business_topic_tags": ["招投标", "人员资质库"],
            "evidence_type_tags": ["真实项目经验"],
            "value_tags": ["验证可行性", "提供系统模块参考"],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "工程招投标平台案例"
    assert data["source_type"] == "company_case"
    assert data["manual_review_status"] == "unreviewed"
    assert "工程建设" in data["industry_tags"]
    assert "招投标" in data["business_topic_tags"]
    assert data["source_url"] == "https://example.com/bidding"
    assert data["confidence_score"] >= 0


def test_review_endpoint_updates_tags_and_evidence(client, admin_auth_headers):
    created = client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "AI影视账号对标",
            "source_type": "manual_note",
            "raw_text": "对标账号每天发布AI影视短片，依靠脚本模板、剪辑工具和账号矩阵形成内容SOP。",
        },
    ).json()

    response = client.put(
        f"/api/knowledge-assets/{created['id']}/review",
        headers=admin_auth_headers,
        json={
            "industry_tags": ["旅游文娱"],
            "business_topic_tags": ["AI影视", "短视频账号运营"],
            "evidence_type_tags": ["竞品案例", "SOP"],
            "value_tags": ["提供运营打法"],
            "proves": ["AI影视账号可以被拆成选题、脚本、制作、发布、复盘流程"],
            "does_not_prove": ["不能证明该打法适合所有影视公司"],
            "applicable_conditions": ["客户具备内容制作人员或外包资源"],
            "migration_risks": ["平台规则和内容审美变化会影响复用效果"],
            "manual_review_status": "reviewed",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["manual_review_status"] == "reviewed"
    assert data["industry_tags"] == ["旅游文娱"]
    assert data["business_topic_tags"] == ["AI影视", "短视频账号运营"]
    assert data["proves"] == ["AI影视账号可以被拆成选题、脚本、制作、发布、复盘流程"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
backend/venv/bin/python -m pytest backend/tests/test_knowledge_assets.py -q
```

Expected: fail during collection or first request because `app.routes.knowledge_assets`, schemas, service, and model do not exist.

- [ ] **Step 3: Add the SQLAlchemy model**

Modify `backend/app/models/models.py` after `AIEmployeeRunStatus`:

```python
class KnowledgeAssetReviewStatus(str, enum.Enum):
    UNREVIEWED = "unreviewed"
    REVIEWED = "reviewed"
    NEEDS_REVISION = "needs_revision"
```

Append the model after `AIEmployeeRun`:

```python
class KnowledgeAsset(Base):
    __tablename__ = "knowledge_assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    source_type = Column(String, nullable=False, index=True)
    source_name = Column(String, nullable=True)
    source_url = Column(String, nullable=True)
    source_file_path = Column(String, nullable=True)
    source_resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id"), nullable=True, index=True)
    source_confidentiality = Column(String, default="internal")
    raw_text = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    industry_tags = Column(JSON, default=list)
    business_topic_tags = Column(JSON, default=list)
    scenario_tags = Column(JSON, default=list)
    evidence_type_tags = Column(JSON, default=list)
    capability_tags = Column(JSON, default=list)
    methodology_tags = Column(JSON, default=list)
    customer_type_tags = Column(JSON, default=list)
    value_tags = Column(JSON, default=list)
    proves = Column(JSON, default=list)
    does_not_prove = Column(JSON, default=list)
    applicable_conditions = Column(JSON, default=list)
    migration_risks = Column(JSON, default=list)
    evidence_strength_score = Column(Float, default=0.0)
    data_verification_score = Column(Float, default=0.0)
    commercial_value_score = Column(Float, default=0.0)
    relevance_score = Column(Float, default=0.0)
    confidence_score = Column(Float, default=0.0)
    confidence_reason = Column(Text, nullable=True)
    manual_review_status = Column(Enum(KnowledgeAssetReviewStatus), default=KnowledgeAssetReviewStatus.UNREVIEWED)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    source_resume = relationship("Resume")
    creator = relationship("User")
```

- [ ] **Step 4: Add schemas**

Create `backend/app/schemas/knowledge_assets.py`:

```python
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.models import KnowledgeAssetReviewStatus


class KnowledgeAssetIntakeRequest(BaseModel):
    title: str
    source_type: str = "manual_note"
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    source_file_path: Optional[str] = None
    source_confidentiality: str = "internal"
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
```

- [ ] **Step 5: Add the service**

Create `backend/app/services/knowledge_asset_service.py`:

```python
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.models import KnowledgeAsset, KnowledgeAssetReviewStatus, Resume
from app.schemas.knowledge_assets import (
    AIProductManagerDraftRequest,
    KnowledgeAssetIntakeRequest,
    KnowledgeAssetReviewUpdate,
    KnowledgeAssetSearchRequest,
)


def _as_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value).strip()] if str(value).strip() else []


def _text_blob(*parts: Any) -> str:
    chunks: List[str] = []
    for part in parts:
        if not part:
            continue
        if isinstance(part, dict):
            chunks.extend(str(value) for value in part.values() if value)
        elif isinstance(part, list):
            chunks.extend(str(value) for value in part if value)
        else:
            chunks.append(str(part))
    return " ".join(chunks)


def _unique(values: Iterable[str]) -> List[str]:
    result: List[str] = []
    for value in values:
        normalized = str(value).strip()
        if normalized and normalized not in result:
            result.append(normalized)
    return result


def _infer_tags(text: str) -> Dict[str, List[str]]:
    rules = [
        ("工程建设", ["工程", "招投标", "投标", "造价", "资质", "施工", "结算"]),
        ("旅游文娱", ["影视", "短视频", "账号", "内容", "文旅", "剪辑"]),
        ("金融行业", ["金融", "银行", "信贷", "风控", "合规"]),
        ("企业管理", ["流程", "审批", "绩效", "组织", "人事"]),
        ("计算机/AI", ["AI", "大模型", "系统", "平台", "自动化", "知识库"]),
    ]
    topics = [
        "招投标", "人员资质库", "工程造价", "结算审计", "项目资料管理",
        "AI影视", "短视频账号运营", "内容生产", "客户增长", "流程自动化",
        "风控合规", "数据看板", "内部效率系统",
    ]
    evidence_types = [
        "真实项目经验", "官方资料", "第三方数据", "竞品案例", "开源项目",
        "商业化产品", "SOP", "方法论", "待验证线索",
    ]
    industry_tags = [label for label, keywords in rules if any(keyword.lower() in text.lower() for keyword in keywords)]
    topic_tags = [topic for topic in topics if topic.lower() in text.lower()]
    evidence_tags = [tag for tag in evidence_types if tag.lower() in text.lower()]
    return {
        "industry_tags": industry_tags or ["通用业务"],
        "business_topic_tags": topic_tags,
        "evidence_type_tags": evidence_tags or ["待验证线索"],
    }


def _confidence_from_asset(raw_text: str, tags: Dict[str, List[str]]) -> float:
    score = 20.0
    if len(raw_text) >= 80:
        score += 20.0
    if tags.get("industry_tags"):
        score += 15.0
    if tags.get("business_topic_tags"):
        score += 20.0
    if any(tag in tags.get("evidence_type_tags", []) for tag in ["真实项目经验", "官方资料", "第三方数据"]):
        score += 20.0
    return min(score, 95.0)


def create_manual_asset(
    db: Session,
    payload: KnowledgeAssetIntakeRequest,
    user_id: Optional[UUID],
) -> KnowledgeAsset:
    inferred = _infer_tags(_text_blob(payload.title, payload.raw_text))
    industry_tags = _unique([*payload.industry_tags, *inferred["industry_tags"]])
    business_topic_tags = _unique([*payload.business_topic_tags, *inferred["business_topic_tags"]])
    evidence_type_tags = _unique([*payload.evidence_type_tags, *inferred["evidence_type_tags"]])
    confidence = _confidence_from_asset(payload.raw_text, {
        "industry_tags": industry_tags,
        "business_topic_tags": business_topic_tags,
        "evidence_type_tags": evidence_type_tags,
    })
    asset = KnowledgeAsset(
        title=payload.title,
        source_type=payload.source_type,
        source_name=payload.source_name,
        source_url=payload.source_url,
        source_file_path=payload.source_file_path,
        source_confidentiality=payload.source_confidentiality,
        raw_text=payload.raw_text,
        summary=payload.raw_text[:240],
        industry_tags=industry_tags,
        business_topic_tags=business_topic_tags,
        scenario_tags=_as_list(payload.scenario_tags),
        evidence_type_tags=evidence_type_tags,
        capability_tags=_as_list(payload.capability_tags),
        methodology_tags=_as_list(payload.methodology_tags),
        customer_type_tags=_as_list(payload.customer_type_tags),
        value_tags=_as_list(payload.value_tags),
        proves=[],
        does_not_prove=[],
        applicable_conditions=[],
        migration_risks=[],
        evidence_strength_score=confidence,
        data_verification_score=confidence if "待验证线索" not in evidence_type_tags else 35.0,
        commercial_value_score=50.0,
        relevance_score=0.0,
        confidence_score=confidence,
        confidence_reason="由入库文本和标签完整度计算，等待人工复核。",
        manual_review_status=KnowledgeAssetReviewStatus.UNREVIEWED,
        created_by=user_id,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


def list_assets(
    db: Session,
    query: Optional[str] = None,
    industry: Optional[str] = None,
    topic: Optional[str] = None,
    evidence_type: Optional[str] = None,
    review_status: Optional[str] = None,
    source_type: Optional[str] = None,
    limit: int = 100,
) -> Dict[str, Any]:
    safe_limit = max(1, min(int(limit or 100), 500))
    q = db.query(KnowledgeAsset)
    if source_type:
        q = q.filter(KnowledgeAsset.source_type == source_type)
    if review_status:
        q = q.filter(KnowledgeAsset.manual_review_status == KnowledgeAssetReviewStatus(review_status))
    if query:
        like = f"%{query}%"
        q = q.filter(or_(KnowledgeAsset.title.ilike(like), KnowledgeAsset.summary.ilike(like), KnowledgeAsset.raw_text.ilike(like)))
    rows = q.order_by(KnowledgeAsset.updated_at.desc(), KnowledgeAsset.created_at.desc()).limit(safe_limit).all()
    filtered = []
    for row in rows:
        if industry and industry not in (row.industry_tags or []):
            continue
        if topic and topic not in (row.business_topic_tags or []):
            continue
        if evidence_type and evidence_type not in (row.evidence_type_tags or []):
            continue
        filtered.append(row)
    return {
        "items": filtered,
        "total": len(filtered),
        "industry_tags": _unique(tag for item in filtered for tag in (item.industry_tags or [])),
        "business_topic_tags": _unique(tag for item in filtered for tag in (item.business_topic_tags or [])),
        "evidence_type_tags": _unique(tag for item in filtered for tag in (item.evidence_type_tags or [])),
    }


def get_asset(db: Session, asset_id: UUID) -> Optional[KnowledgeAsset]:
    return db.query(KnowledgeAsset).filter(KnowledgeAsset.id == asset_id).first()


def update_asset_review(db: Session, asset_id: UUID, payload: KnowledgeAssetReviewUpdate) -> Optional[KnowledgeAsset]:
    asset = get_asset(db, asset_id)
    if not asset:
        return None
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(asset, key, value)
    db.commit()
    db.refresh(asset)
    return asset
```

- [ ] **Step 6: Add routes and router registration**

Create `backend/app/routes/knowledge_assets.py`:

```python
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
```

Modify `backend/app/main.py`:

```python
from app.routes import auth, resumes, settings, resume_mail_imports, knowledge_assets, business_workbench
...
app.include_router(resume_mail_imports.router, prefix="/api")
app.include_router(knowledge_assets.router, prefix="/api")
app.include_router(business_workbench.router, prefix="/api")
```

Modify `backend/tests/conftest.py` imports:

```python
from app.models.models import (
    Base, User, UserRole, Position, PositionStatus, PositionUrgency, PositionType,
    Resume, ResumeStatus, ScreeningResult, Interview, InterviewStatus, InterviewResult,
    InterviewPanel, DepartmentReview, SystemConfig, CodingTest, CodingSubmission,
    ResumeMailImport, CustomerProject, ProjectTask, SolutionDocument, AIEmployeeRun,
    KnowledgeAsset,
)
```

Add `KnowledgeAsset.__table__` to `tables_to_create` after `AIEmployeeRun.__table__`.

Modify test app imports and router registration:

```python
from app.routes import auth, positions, resumes, interviews, coding_tests, settings, resume_mail_imports, knowledge_assets, business_workbench
...
test_app.include_router(resume_mail_imports.router, prefix="/api")
test_app.include_router(knowledge_assets.router, prefix="/api")
test_app.include_router(business_workbench.router, prefix="/api")
```

- [ ] **Step 7: Run the tests and verify they pass**

Run:

```bash
backend/venv/bin/python -m pytest backend/tests/test_knowledge_assets.py -q
```

Expected: 2 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/models.py backend/app/schemas/knowledge_assets.py backend/app/services/knowledge_asset_service.py backend/app/routes/knowledge_assets.py backend/app/main.py backend/tests/conftest.py backend/tests/test_knowledge_assets.py
git commit -m "feat: add knowledge asset domain"
```

---

### Task 2: Resume-Derived Knowledge Asset Sync

**Files:**
- Modify: `backend/app/services/knowledge_asset_service.py`
- Modify: `backend/app/routes/knowledge_assets.py`
- Modify: `backend/app/services/resume_service.py`
- Modify: `backend/tests/test_knowledge_assets.py`

- [ ] **Step 1: Write the failing sync tests**

Append to `backend/tests/test_knowledge_assets.py`:

```python
from app.models.models import Resume, ResumeStatus, ScreeningResult


def test_resume_sync_creates_project_and_work_knowledge_assets(client, admin_auth_headers, db):
    resume = Resume(
        id=uuid4(),
        candidate_name="李工",
        file_path="uploads/resumes/engineering.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        parsed_data={
            "industry_label": "工程建设",
            "work_experiences": [
                {
                    "company": "工程咨询公司",
                    "role": "项目经理",
                    "summary": "负责招投标流程、人员资质库和投标文件审核。",
                    "capabilities": ["招投标", "资质管理"],
                }
            ],
            "project_experiences": [
                {
                    "name": "招投标资料平台",
                    "problem": "投标资料分散，人员资质复用困难。",
                    "solution": "建设模板库、资质库和审批流程。",
                    "business_model": "项目制系统建设",
                    "metrics": ["投标文件制作周期缩短"],
                }
            ],
        },
    )
    db.add(resume)
    db.commit()

    response = client.post(
        f"/api/resumes/{resume.id}/knowledge-assets/sync",
        headers=admin_auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    titles = {item["title"] for item in data["items"]}
    assert "李工 - 工程咨询公司工作经验" in titles
    assert "招投标资料平台" in titles
    project = next(item for item in data["items"] if item["title"] == "招投标资料平台")
    assert project["source_type"] == "resume_project"
    assert "工程建设" in project["industry_tags"]
    assert "招投标" in project["business_topic_tags"]
    assert "真实项目经验" in project["evidence_type_tags"]


def test_resume_sync_is_idempotent(client, admin_auth_headers, db):
    resume = Resume(
        id=uuid4(),
        candidate_name="周运营",
        file_path="uploads/resumes/media.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        parsed_data={
            "industry_label": "旅游文娱",
            "project_experiences": [
                {"name": "AI影视账号矩阵", "solution": "建立脚本、剪辑、发布和复盘SOP。"}
            ],
        },
    )
    db.add(resume)
    db.commit()

    client.post(f"/api/resumes/{resume.id}/knowledge-assets/sync", headers=admin_auth_headers)
    second = client.post(f"/api/resumes/{resume.id}/knowledge-assets/sync", headers=admin_auth_headers)

    assert second.status_code == 200
    assert second.json()["total"] == 1
```

- [ ] **Step 2: Run sync tests and confirm failure**

Run:

```bash
backend/venv/bin/python -m pytest backend/tests/test_knowledge_assets.py -k resume_sync -q
```

Expected: fail because the sync route and service do not exist.

- [ ] **Step 3: Add resume sync helpers**

Append to `backend/app/services/knowledge_asset_service.py`:

```python
def _asset_title_for_work(resume: Resume, work: Dict[str, Any]) -> str:
    company = work.get("company") or "未命名公司"
    return f"{resume.candidate_name or '匿名样本'} - {company}工作经验"


def _asset_text_for_work(work: Dict[str, Any]) -> str:
    return _text_blob(
        work.get("company"),
        work.get("role"),
        work.get("period"),
        work.get("summary"),
        work.get("capabilities"),
        work.get("logic_signals"),
    )


def _asset_text_for_project(project: Dict[str, Any]) -> str:
    return _text_blob(
        project.get("name"),
        project.get("role"),
        project.get("problem"),
        project.get("solution"),
        project.get("business_model"),
        project.get("metrics"),
        project.get("missing_evidence"),
        project.get("logic_signals"),
    )


def _create_or_update_resume_asset(
    db: Session,
    resume: Resume,
    source_type: str,
    title: str,
    raw_text: str,
    source_name: str,
) -> KnowledgeAsset:
    existing = (
        db.query(KnowledgeAsset)
        .filter(
            KnowledgeAsset.source_resume_id == resume.id,
            KnowledgeAsset.source_type == source_type,
            KnowledgeAsset.title == title,
        )
        .first()
    )
    inferred = _infer_tags(_text_blob(title, raw_text, resume.parsed_data or {}))
    industry_tags = _unique([resume.parsed_data.get("industry_label") if resume.parsed_data else "", *inferred["industry_tags"]])
    confidence = _confidence_from_asset(raw_text, inferred)
    fields = {
        "source_name": source_name,
        "source_confidentiality": "anonymized",
        "raw_text": raw_text,
        "summary": raw_text[:240],
        "industry_tags": industry_tags,
        "business_topic_tags": inferred["business_topic_tags"],
        "evidence_type_tags": _unique(["真实项目经验", *inferred["evidence_type_tags"]]),
        "value_tags": ["验证可行性", "提供流程参考"],
        "evidence_strength_score": confidence,
        "data_verification_score": 45.0,
        "commercial_value_score": 55.0,
        "confidence_score": confidence,
        "confidence_reason": "由简历项目或工作经历拆解生成，默认作为匿名能力证据，需人工复核。",
    }
    if existing:
        for key, value in fields.items():
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing
    asset = KnowledgeAsset(
        title=title,
        source_type=source_type,
        source_resume_id=resume.id,
        **fields,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


def sync_resume_knowledge_assets(db: Session, resume: Resume) -> List[KnowledgeAsset]:
    parsed = resume.parsed_data or {}
    assets: List[KnowledgeAsset] = []
    for work in parsed.get("work_experiences") or []:
        if not isinstance(work, dict):
            continue
        raw_text = _asset_text_for_work(work)
        if not raw_text.strip():
            continue
        assets.append(
            _create_or_update_resume_asset(
                db,
                resume,
                "resume_work_experience",
                _asset_title_for_work(resume, work),
                raw_text,
                work.get("company") or resume.candidate_name or "简历工作经历",
            )
        )
    for project in parsed.get("project_experiences") or []:
        if not isinstance(project, dict):
            continue
        title = project.get("name") or "未命名项目经验"
        raw_text = _asset_text_for_project(project)
        if not raw_text.strip():
            continue
        assets.append(
            _create_or_update_resume_asset(
                db,
                resume,
                "resume_project",
                title,
                raw_text,
                resume.candidate_name or "简历项目经历",
            )
        )
    return assets
```

- [ ] **Step 4: Add sync route**

Modify `backend/app/routes/knowledge_assets.py` imports:

```python
from app.models.models import Resume, User
```

Append route before `/{asset_id}`:

```python
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
```

- [ ] **Step 5: Call sync after resume processing succeeds**

Modify `backend/app/services/resume_service.py` imports:

```python
from app.services.knowledge_asset_service import sync_resume_knowledge_assets
```

In `process_resume_task`, after `resume.raw_text = content` and before the following `db.commit()`:

```python
        sync_resume_knowledge_assets(db, resume)
```

- [ ] **Step 6: Run sync tests**

Run:

```bash
backend/venv/bin/python -m pytest backend/tests/test_knowledge_assets.py -k resume_sync -q
```

Expected: 2 passed.

- [ ] **Step 7: Run resume processing regression tests**

Run:

```bash
backend/venv/bin/python -m pytest backend/tests/test_resume_intelligence_service.py -k process_resume_task -q
```

Expected: the selected process-resume tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/knowledge_asset_service.py backend/app/routes/knowledge_assets.py backend/app/services/resume_service.py backend/tests/test_knowledge_assets.py
git commit -m "feat: sync resume experiences into knowledge assets"
```

---

### Task 3: AI-Assisted Tagging Prompt With Deterministic Fallback

**Files:**
- Modify: `backend/app/config/prompt_variables.py`
- Modify: `backend/app/utils/prompt_manager.py`
- Modify: `backend/app/services/ai_service.py`
- Modify: `backend/app/services/knowledge_asset_service.py`
- Modify: `backend/tests/test_knowledge_assets.py`

- [ ] **Step 1: Write failing tagging tests**

Append to `backend/tests/test_knowledge_assets.py`:

```python
from app.services import knowledge_asset_service


def test_manual_intake_uses_ai_tagging_when_available(client, admin_auth_headers, monkeypatch):
    def fake_generate_knowledge_asset_tags(payload):
        return {
            "summary": "工程招投标资料系统可作为可行性证据。",
            "industry_tags": ["工程建设"],
            "business_topic_tags": ["招投标", "人员资质库"],
            "evidence_type_tags": ["真实项目经验"],
            "value_tags": ["验证可行性"],
            "proves": ["招投标资料和人员资质可以系统化管理"],
            "does_not_prove": ["不能证明当前客户预算充足"],
            "applicable_conditions": ["客户已有投标资料和资质数据"],
            "migration_risks": ["资料口径不统一会影响落地"],
            "score_dimensions": {
                "evidence_strength_score": 82,
                "data_verification_score": 65,
                "commercial_value_score": 76,
                "confidence_score": 74,
            },
            "confidence_reason": "有真实项目描述，但缺少量化指标。",
        }

    monkeypatch.setattr(
        knowledge_asset_service,
        "generate_knowledge_asset_tags",
        fake_generate_knowledge_asset_tags,
    )

    response = client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "招投标资料系统",
            "source_type": "manual_note",
            "raw_text": "客户想把投标资料、人员资质、模板和审批流程做成系统。",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["summary"] == "工程招投标资料系统可作为可行性证据。"
    assert data["proves"] == ["招投标资料和人员资质可以系统化管理"]
    assert data["confidence_score"] == 74


def test_manual_intake_falls_back_when_ai_tagging_returns_empty(client, admin_auth_headers, monkeypatch):
    monkeypatch.setattr(knowledge_asset_service, "generate_knowledge_asset_tags", lambda payload: {})

    response = client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "AI影视SOP",
            "source_type": "manual_note",
            "raw_text": "AI影视账号需要对标账号、脚本模板、剪辑工具、发布节奏和复盘数据。",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "旅游文娱" in data["industry_tags"]
    assert data["manual_review_status"] == "unreviewed"
    assert data["confidence_reason"]
```

- [ ] **Step 2: Run tagging tests and confirm failure**

Run:

```bash
backend/venv/bin/python -m pytest backend/tests/test_knowledge_assets.py -k "ai_tagging or falls_back" -q
```

Expected: fail because `generate_knowledge_asset_tags` is not imported or used.

- [ ] **Step 3: Add prompt variables**

Modify `backend/app/config/prompt_variables.py`:

```python
    "tag_knowledge_asset": [
        {"name": "asset_payload", "description": "待归档资料的标题、来源、原文和用户初始标签"},
    ],
```

Add to `ALL_VARIABLES`:

```python
    "asset_payload": "待归档资料的标题、来源、原文和用户初始标签",
```

- [ ] **Step 4: Add default prompt**

Modify `backend/app/utils/prompt_manager.py` inside `DEFAULT_PROMPTS["prompts"]`:

```python
        "tag_knowledge_asset": {
            "system": "你是一个严谨的数据资产标注员，负责把业务资料清洗成可检索、可审计、可被AI产品经理引用的知识资产。请严格返回JSON，不要添加额外说明。",
            "user": """请根据以下资料生成知识资产标签和证据说明。

要求：
1. 不要把资料说成已验证事实，除非原文有明确项目、官方资料、第三方数据或指标支撑。
2. 必须说明这条资产能证明什么，以及不能证明什么。
3. 标签要服务于后续检索，例如行业、业务主题、证据类型、可用价值。
4. 信息不足时，把缺口写入 does_not_prove 或 migration_risks。

资料：
{asset_payload}

请严格返回以下JSON：
{
  "summary": "资料摘要",
  "industry_tags": ["行业标签"],
  "business_topic_tags": ["业务主题标签"],
  "scenario_tags": ["场景标签"],
  "evidence_type_tags": ["证据类型标签"],
  "capability_tags": ["能力标签"],
  "methodology_tags": ["方法论标签"],
  "customer_type_tags": ["客户类型标签"],
  "value_tags": ["可用价值标签"],
  "proves": ["这条资料能支撑的判断"],
  "does_not_prove": ["这条资料不能直接证明的判断"],
  "applicable_conditions": ["可迁移或复用的条件"],
  "migration_risks": ["迁移风险"],
  "score_dimensions": {
    "evidence_strength_score": 0到100,
    "data_verification_score": 0到100,
    "commercial_value_score": 0到100,
    "confidence_score": 0到100
  },
  "confidence_reason": "评分原因"
}"""
        },
```

- [ ] **Step 5: Add AI service helper**

Modify `backend/app/services/ai_service.py`:

```python
def generate_knowledge_asset_tags(asset_payload: Dict[str, Any]) -> Dict[str, Any]:
    prompt_data = prompt_manager.get_prompt(
        "tag_knowledge_asset",
        asset_payload=json.dumps(asset_payload, ensure_ascii=False, indent=2),
    )
    if not prompt_data.get("user"):
        return {}
    try:
        cfg = _get_llm_config()
        extra = _completion_options(cfg, json_response=True)
        completion = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {"role": "system", "content": prompt_data["system"]},
                {"role": "user", "content": prompt_data["user"]},
            ],
            extra_body=_get_extra_body(),
            **extra,
        )
        parsed = _parse_json_content(completion.choices[0].message.content)
        return parsed if isinstance(parsed, dict) else {}
    except Exception as e:
        print(f"Knowledge asset tagging failed: {e}")
        return {}
```

- [ ] **Step 6: Use AI tags in manual intake**

Modify `backend/app/services/knowledge_asset_service.py` imports:

```python
from app.services.ai_service import generate_knowledge_asset_tags
```

Inside `create_manual_asset`, before `inferred = _infer_tags(...)`, add:

```python
    ai_tags = generate_knowledge_asset_tags(payload.model_dump())
```

Replace tag and score assignment in `create_manual_asset` with:

```python
    inferred = _infer_tags(_text_blob(payload.title, payload.raw_text))
    industry_tags = _unique([*payload.industry_tags, *inferred["industry_tags"], *_as_list(ai_tags.get("industry_tags"))])
    business_topic_tags = _unique([*payload.business_topic_tags, *inferred["business_topic_tags"], *_as_list(ai_tags.get("business_topic_tags"))])
    evidence_type_tags = _unique([*payload.evidence_type_tags, *inferred["evidence_type_tags"], *_as_list(ai_tags.get("evidence_type_tags"))])
    score_dimensions = ai_tags.get("score_dimensions") if isinstance(ai_tags.get("score_dimensions"), dict) else {}
    confidence = float(score_dimensions.get("confidence_score") or _confidence_from_asset(payload.raw_text, {
        "industry_tags": industry_tags,
        "business_topic_tags": business_topic_tags,
        "evidence_type_tags": evidence_type_tags,
    }))
```

Use AI fields when constructing `KnowledgeAsset`:

```python
        summary=ai_tags.get("summary") or payload.raw_text[:240],
        scenario_tags=_unique([*payload.scenario_tags, *_as_list(ai_tags.get("scenario_tags"))]),
        capability_tags=_unique([*payload.capability_tags, *_as_list(ai_tags.get("capability_tags"))]),
        methodology_tags=_unique([*payload.methodology_tags, *_as_list(ai_tags.get("methodology_tags"))]),
        customer_type_tags=_unique([*payload.customer_type_tags, *_as_list(ai_tags.get("customer_type_tags"))]),
        value_tags=_unique([*payload.value_tags, *_as_list(ai_tags.get("value_tags"))]),
        proves=_as_list(ai_tags.get("proves")),
        does_not_prove=_as_list(ai_tags.get("does_not_prove")),
        applicable_conditions=_as_list(ai_tags.get("applicable_conditions")),
        migration_risks=_as_list(ai_tags.get("migration_risks")),
        evidence_strength_score=float(score_dimensions.get("evidence_strength_score") or confidence),
        data_verification_score=float(score_dimensions.get("data_verification_score") or (confidence if "待验证线索" not in evidence_type_tags else 35.0)),
        commercial_value_score=float(score_dimensions.get("commercial_value_score") or 50.0),
        confidence_score=confidence,
        confidence_reason=ai_tags.get("confidence_reason") or "由入库文本和标签完整度计算，等待人工复核。",
```

- [ ] **Step 7: Run tagging tests**

Run:

```bash
backend/venv/bin/python -m pytest backend/tests/test_knowledge_assets.py -k "ai_tagging or falls_back" -q
```

Expected: 2 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/app/config/prompt_variables.py backend/app/utils/prompt_manager.py backend/app/services/ai_service.py backend/app/services/knowledge_asset_service.py backend/tests/test_knowledge_assets.py
git commit -m "feat: add ai assisted knowledge asset tagging"
```

---

### Task 4: Demand Retrieval And Controlled AI Product Manager Drafts

**Files:**
- Modify: `backend/app/config/prompt_variables.py`
- Modify: `backend/app/utils/prompt_manager.py`
- Modify: `backend/app/schemas/knowledge_assets.py`
- Modify: `backend/app/services/ai_service.py`
- Modify: `backend/app/services/knowledge_asset_service.py`
- Modify: `backend/app/routes/knowledge_assets.py`
- Modify: `backend/tests/test_knowledge_assets.py`

- [ ] **Step 1: Write failing retrieval and draft tests**

Append to `backend/tests/test_knowledge_assets.py`:

```python
def test_asset_search_matches_demand_terms(client, admin_auth_headers):
    created = client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "招投标资料自动化",
            "source_type": "company_case",
            "raw_text": "工程咨询公司把投标模板、人员资质和审批流程做成招投标资料平台。",
            "industry_tags": ["工程建设"],
            "business_topic_tags": ["招投标"],
            "evidence_type_tags": ["真实项目经验"],
            "value_tags": ["验证可行性"],
        },
    ).json()

    response = client.post(
        "/api/knowledge-assets/search",
        headers=admin_auth_headers,
        json={"query": "我们想做招投标相关优化", "limit": 5},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["items"][0]["asset"]["id"] == created["id"]
    assert data["items"][0]["match_score"] > 0
    assert "招投标" in data["items"][0]["match_reason"]


def test_ai_product_manager_draft_uses_cited_assets(client, admin_auth_headers, monkeypatch):
    client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "工程招投标资料平台",
            "source_type": "company_case",
            "raw_text": "已有工程咨询公司通过投标模板库和人员资质库提升投标资料制作效率。",
            "industry_tags": ["工程建设"],
            "business_topic_tags": ["招投标", "人员资质库"],
            "evidence_type_tags": ["真实项目经验"],
            "value_tags": ["验证可行性", "提供系统模块参考"],
        },
    )

    response = client.post(
        "/api/ai-product-manager/draft",
        headers=admin_auth_headers,
        json={
            "demand": "我们公司需要招投标相关优化",
            "company_profile": "工程咨询公司，已有投标资料和人员资质数据。",
            "limit": 5,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "招投标" in data["demand_understanding"]
    assert data["cited_assets"]
    assert data["solution_hypotheses"]
    assert data["missing_questions"]
    assert data["human_confirmation_points"]
    assert data["fallback_used"] is True
```

- [ ] **Step 2: Run retrieval tests and confirm failure**

Run:

```bash
backend/venv/bin/python -m pytest backend/tests/test_knowledge_assets.py -k "search_matches or product_manager" -q
```

Expected: fail because search and AI product manager routes do not exist.

- [ ] **Step 3: Add AI product manager prompt**

Modify `backend/app/config/prompt_variables.py`:

```python
    "generate_ai_product_manager_draft": [
        {"name": "draft_payload", "description": "用户需求、客户背景、检索到的知识资产和输出约束"},
    ],
```

Add to `ALL_VARIABLES`:

```python
    "draft_payload": "用户需求、客户背景、检索到的知识资产和输出约束",
```

Modify `backend/app/utils/prompt_manager.py`:

```python
        "generate_ai_product_manager_draft": {
            "system": "你是一个受控的AI产品经理，只能基于检索到的知识资产和用户输入提出方案假设。请严格返回JSON，不要添加额外说明。",
            "user": """请根据用户需求和知识资产生成受控方案草案。

要求：
1. 必须引用知识资产作为依据。
2. 不要承诺ROI、收益或可落地性，除非知识资产中有明确数据支撑。
3. 证据不足时必须追问，不要编造事实。
4. 输出应像产品经理给老板讲想法：说明依据、假设、缺口、人工确认点和下一步流程。

输入：
{draft_payload}

请严格返回以下JSON：
{
  "demand_understanding": "对用户需求的理解",
  "evidence_summary": ["检索到的证据摘要"],
  "solution_hypotheses": [
    {
      "name": "方案假设名称",
      "why_reasonable": "为什么这个方向值得讨论",
      "supporting_assets": ["引用的知识资产标题"],
      "risk": "主要风险"
    }
  ],
  "missing_questions": ["还需要问用户的问题"],
  "human_confirmation_points": ["需要人工确认的点"],
  "next_workflow": ["下一步流程"]
}"""
        },
```

- [ ] **Step 4: Add AI service helper**

Modify `backend/app/services/ai_service.py`:

```python
def generate_ai_product_manager_draft(draft_payload: Dict[str, Any]) -> Dict[str, Any]:
    prompt_data = prompt_manager.get_prompt(
        "generate_ai_product_manager_draft",
        draft_payload=json.dumps(draft_payload, ensure_ascii=False, indent=2),
    )
    if not prompt_data.get("user"):
        return {}
    try:
        cfg = _get_llm_config()
        extra = _completion_options(cfg, json_response=True)
        completion = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {"role": "system", "content": prompt_data["system"]},
                {"role": "user", "content": prompt_data["user"]},
            ],
            extra_body=_get_extra_body(),
            **extra,
        )
        parsed = _parse_json_content(completion.choices[0].message.content)
        return parsed if isinstance(parsed, dict) else {}
    except Exception as e:
        print(f"AI product manager draft failed: {e}")
        return {}
```

- [ ] **Step 5: Add retrieval and fallback draft service**

Modify `backend/app/services/knowledge_asset_service.py` imports:

```python
from app.schemas.knowledge_assets import (
    AIProductManagerDraftRequest,
    KnowledgeAssetIntakeRequest,
    KnowledgeAssetReviewUpdate,
    KnowledgeAssetSearchRequest,
)
from app.services.ai_service import generate_ai_product_manager_draft, generate_knowledge_asset_tags
```

Append:

```python
def _terms_for_query(query: str) -> List[str]:
    terms = _infer_tags(query)
    tokens = [token for token in query.replace("，", " ").replace("。", " ").replace("、", " ").split() if len(token) >= 2]
    return _unique([query, *tokens, *terms["industry_tags"], *terms["business_topic_tags"], *terms["evidence_type_tags"]])


def search_assets(db: Session, payload: KnowledgeAssetSearchRequest) -> Dict[str, Any]:
    terms = _terms_for_query(payload.query)
    assets = db.query(KnowledgeAsset).order_by(KnowledgeAsset.confidence_score.desc(), KnowledgeAsset.updated_at.desc()).limit(300).all()
    results = []
    for asset in assets:
        text = _text_blob(
            asset.title,
            asset.summary,
            asset.raw_text,
            asset.industry_tags,
            asset.business_topic_tags,
            asset.evidence_type_tags,
            asset.value_tags,
            asset.proves,
        )
        score = sum(10 for term in terms if term and term in text)
        score += sum(8 for tag in payload.industry_tags if tag in (asset.industry_tags or []))
        score += sum(8 for tag in payload.business_topic_tags if tag in (asset.business_topic_tags or []))
        score += sum(8 for tag in payload.evidence_type_tags if tag in (asset.evidence_type_tags or []))
        score += float(asset.confidence_score or 0) / 10
        if score <= 0:
            continue
        matched = [term for term in terms if term and term in text][:5]
        results.append(
            {
                "asset": asset,
                "match_score": score,
                "match_reason": "命中：" + "、".join(matched) if matched else "标签或置信度相关",
            }
        )
    results.sort(key=lambda item: item["match_score"], reverse=True)
    safe_limit = max(1, min(int(payload.limit or 8), 20))
    return {"query": payload.query, "items": results[:safe_limit]}


def _fallback_product_manager_draft(payload: AIProductManagerDraftRequest, retrieved: List[Dict[str, Any]]) -> Dict[str, Any]:
    asset_titles = [item["asset"].title for item in retrieved]
    demand = payload.demand.strip()
    first_topic = retrieved[0]["asset"].business_topic_tags[0] if retrieved and retrieved[0]["asset"].business_topic_tags else "业务优化"
    return {
        "demand_understanding": f"用户希望围绕{demand}找到可验证的优化方向，当前先按{first_topic}相关资料做方案假设。",
        "evidence_summary": [
            f"{item['asset'].title}：{item['asset'].summary or item['asset'].raw_text or '已归档知识资产'}"
            for item in retrieved[:5]
        ],
        "solution_hypotheses": [
            {
                "name": f"{first_topic}方案假设",
                "why_reasonable": "已有知识资产显示该方向存在项目经验或资料依据，但需要结合客户现状继续验证。",
                "supporting_assets": asset_titles[:5],
                "risk": "当前证据只能支撑方向讨论，不能直接证明客户预算、数据条件和组织配合已经满足。",
            }
        ],
        "missing_questions": [
            "客户当前流程是人工处理、表格管理还是已有系统？",
            "现有资料、模板、数据和责任人分别在哪里？",
            "本次优先目标是提升效率、降低风险、增加收入还是形成标准化交付？",
        ],
        "human_confirmation_points": [
            "确认客户真实业务边界和预算。",
            "确认可使用的数据来源和保密要求。",
            "确认方案输出是咨询建议、PRD、SOP还是开发计划。",
        ],
        "next_workflow": [
            "整理客户现状和资料清单。",
            "形成设计方案。",
            "输出PRD或SOP。",
            "检索开源项目或商业产品作为参考。",
            "再决定购买、集成、定制开发或人工运营。",
        ],
    }


def generate_controlled_product_manager_draft(db: Session, payload: AIProductManagerDraftRequest) -> Dict[str, Any]:
    search_result = search_assets(db, KnowledgeAssetSearchRequest(query=payload.demand, limit=payload.limit))
    retrieved = search_result["items"]
    draft_payload = {
        "demand": payload.demand,
        "company_profile": payload.company_profile,
        "constraints": payload.constraints,
        "confirmed_context": payload.confirmed_context,
        "retrieved_assets": [
            {
                "id": str(item["asset"].id),
                "title": item["asset"].title,
                "summary": item["asset"].summary,
                "industry_tags": item["asset"].industry_tags,
                "business_topic_tags": item["asset"].business_topic_tags,
                "proves": item["asset"].proves,
                "does_not_prove": item["asset"].does_not_prove,
                "match_reason": item["match_reason"],
            }
            for item in retrieved
        ],
    }
    generated = generate_ai_product_manager_draft(draft_payload)
    fallback_used = not bool(generated)
    if fallback_used:
        generated = _fallback_product_manager_draft(payload, retrieved)
    return {
        **generated,
        "cited_assets": retrieved,
        "model_used": not fallback_used,
        "fallback_used": fallback_used,
    }
```

- [ ] **Step 6: Add search and draft routes**

Modify `backend/app/routes/knowledge_assets.py` imports:

```python
from app.schemas.knowledge_assets import (
    AIProductManagerDraftRequest,
    AIProductManagerDraftResponse,
    KnowledgeAssetIntakeRequest,
    KnowledgeAssetListResponse,
    KnowledgeAssetResponse,
    KnowledgeAssetReviewUpdate,
    KnowledgeAssetSearchRequest,
    KnowledgeAssetSearchResponse,
)
```

Add before `/{asset_id}`:

```python
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
```

- [ ] **Step 7: Run retrieval tests**

Run:

```bash
backend/venv/bin/python -m pytest backend/tests/test_knowledge_assets.py -k "search_matches or product_manager" -q
```

Expected: 2 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/knowledge_assets.py backend/app/services/ai_service.py backend/app/services/knowledge_asset_service.py backend/app/routes/knowledge_assets.py backend/app/config/prompt_variables.py backend/app/utils/prompt_manager.py backend/tests/test_knowledge_assets.py
git commit -m "feat: add controlled ai product manager drafts"
```

---

### Task 5: Frontend Knowledge Asset Library And Intake

**Files:**
- Modify: `frontend/src/router/index.tsx`
- Modify: `frontend/src/components/Layout/index.tsx`
- Replace: `frontend/src/pages/KnowledgeAssets/index.tsx`
- Create: `frontend/src/pages/KnowledgeAssets/Detail.tsx`
- Create: `frontend/src/pages/KnowledgeAssets/Intake.tsx`

- [ ] **Step 1: Add frontend routes**

Modify `frontend/src/router/index.tsx`:

```tsx
const KnowledgeAssets = lazy(() => import('../pages/KnowledgeAssets'));
const KnowledgeAssetDetail = lazy(() => import('../pages/KnowledgeAssets/Detail'));
const KnowledgeAssetIntake = lazy(() => import('../pages/KnowledgeAssets/Intake'));
```

Add children:

```tsx
      {
        path: 'knowledge-assets',
        element: lazyPage(<KnowledgeAssets />),
      },
      {
        path: 'knowledge-assets/intake',
        element: lazyPage(<KnowledgeAssetIntake />),
      },
      {
        path: 'knowledge-assets/:id',
        element: lazyPage(<KnowledgeAssetDetail />),
      },
```

Remove the older single `knowledge-assets` route if it appears earlier in the same children list.

- [ ] **Step 2: Update navigation**

Modify `frontend/src/components/Layout/index.tsx` menu items:

```tsx
    {
      key: '/knowledge-assets',
      icon: <AppstoreOutlined />,
      label: '行业知识资产库',
    },
    {
      key: '/knowledge-assets/intake',
      icon: <UploadOutlined />,
      label: '数据入库',
      roles: ['admin', 'hr'],
    },
```

Keep `/resumes` as an internal source page with label `简历来源数据` or leave it lower in the menu for now.

- [ ] **Step 3: Replace asset library page**

Replace `frontend/src/pages/KnowledgeAssets/index.tsx` with:

```tsx
import React, { useEffect, useState } from 'react';
import { Button, Card, Input, Select, Space, Table, Tag, Typography, message } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import '../BusinessWorkbench.css';

const { Title, Text } = Typography;

type KnowledgeAsset = {
  id: string;
  title: string;
  source_type: string;
  summary?: string;
  industry_tags: string[];
  business_topic_tags: string[];
  evidence_type_tags: string[];
  value_tags: string[];
  confidence_score: number;
  manual_review_status: string;
  updated_at?: string;
};

const KnowledgeAssets: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState<KnowledgeAsset[]>([]);
  const [query, setQuery] = useState('');
  const [industry, setIndustry] = useState<string | undefined>();
  const [topic, setTopic] = useState<string | undefined>();
  const [reviewStatus, setReviewStatus] = useState<string | undefined>();
  const [tagOptions, setTagOptions] = useState<{ industries: string[]; topics: string[] }>({ industries: [], topics: [] });

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const data = await request.get('/knowledge-assets', {
        params: { query, industry, topic, review_status: reviewStatus },
      });
      setAssets(data.items || []);
      setTagOptions({
        industries: data.industry_tags || [],
        topics: data.business_topic_tags || [],
      });
    } catch (error) {
      message.error(getApiErrorMessage(error, '获取行业知识资产失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const columns = [
    {
      title: '资产',
      dataIndex: 'title',
      render: (_: string, record: KnowledgeAsset) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.title}</Text>
          <Text type="secondary">{record.summary || '暂无摘要'}</Text>
        </Space>
      ),
    },
    {
      title: '标签',
      render: (_: unknown, record: KnowledgeAsset) => (
        <Space wrap>
          {record.industry_tags.map(tag => <Tag key={tag} color="blue">{tag}</Tag>)}
          {record.business_topic_tags.map(tag => <Tag key={tag}>{tag}</Tag>)}
        </Space>
      ),
    },
    {
      title: '证据',
      render: (_: unknown, record: KnowledgeAsset) => (
        <Space wrap>
          {record.evidence_type_tags.map(tag => <Tag key={tag} color="gold">{tag}</Tag>)}
        </Space>
      ),
    },
    {
      title: '置信度',
      dataIndex: 'confidence_score',
      width: 100,
      render: (value: number) => Math.round(value || 0),
    },
    {
      title: '状态',
      dataIndex: 'manual_review_status',
      width: 120,
      render: (value: string) => <Tag color={value === 'reviewed' ? 'green' : 'orange'}>{value === 'reviewed' ? '已复核' : '待复核'}</Tag>,
    },
    {
      title: '操作',
      width: 100,
      render: (_: unknown, record: KnowledgeAsset) => <Button onClick={() => navigate(`/knowledge-assets/${record.id}`)}>查看</Button>,
    },
  ];

  return (
    <div className="workbench-page">
      <section className="consulting-hero">
        <div className="consulting-hero-copy">
          <span className="dossier-code">Data Asset Control</span>
          <Title level={1}>行业知识资产库</Title>
          <Text>把简历项目、官方资料、三方数据、竞品案例和 SOP 统一清洗成可检索、可复核、可引用的数据资产。</Text>
        </div>
        <Space className="consulting-hero-actions">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/knowledge-assets/intake')}>数据入库</Button>
        </Space>
      </section>

      <Card className="consulting-table-card" title="资产检索与复核">
        <Space wrap style={{ marginBottom: 16 }}>
          <Input value={query} onChange={event => setQuery(event.target.value)} prefix={<SearchOutlined />} placeholder="输入需求或关键词" style={{ width: 260 }} onPressEnter={fetchAssets} />
          <Select allowClear placeholder="行业" value={industry} onChange={setIndustry} style={{ width: 160 }} options={tagOptions.industries.map(tag => ({ label: tag, value: tag }))} />
          <Select allowClear placeholder="业务主题" value={topic} onChange={setTopic} style={{ width: 180 }} options={tagOptions.topics.map(tag => ({ label: tag, value: tag }))} />
          <Select allowClear placeholder="复核状态" value={reviewStatus} onChange={setReviewStatus} style={{ width: 140 }} options={[{ label: '待复核', value: 'unreviewed' }, { label: '已复核', value: 'reviewed' }, { label: '需修正', value: 'needs_revision' }]} />
          <Button type="primary" onClick={fetchAssets}>查询</Button>
        </Space>
        <Table rowKey="id" loading={loading} columns={columns} dataSource={assets} />
      </Card>
    </div>
  );
};

export default KnowledgeAssets;
```

- [ ] **Step 4: Add intake page**

Create `frontend/src/pages/KnowledgeAssets/Intake.tsx`:

```tsx
import React, { useState } from 'react';
import { App, Button, Card, Form, Input, Select, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import '../BusinessWorkbench.css';

const { Title, Text } = Typography;

const Intake: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (values: any) => {
    setSubmitting(true);
    try {
      const asset = await request.post('/knowledge-assets/intake', values, { timeout: 60000 });
      message.success('知识资产已入库，等待复核');
      navigate(`/knowledge-assets/${asset.id}`);
    } catch (error) {
      message.error(getApiErrorMessage(error, '数据入库失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="workbench-page">
      <section className="consulting-hero">
        <div className="consulting-hero-copy">
          <span className="dossier-code">Data Intake</span>
          <Title level={1}>数据入库</Title>
          <Text>录入案例、官方资料、三方数据、竞品信息、开源项目或 SOP，由系统先生成标签草稿，再进入人工复核。</Text>
        </div>
      </section>
      <Card className="consulting-table-card" title="新建知识资产">
        <Form layout="vertical" onFinish={submit}>
          <Form.Item name="title" label="资产标题" rules={[{ required: true, message: '请输入资产标题' }]}>
            <Input placeholder="例如：工程招投标资料自动化案例" />
          </Form.Item>
          <Form.Item name="source_type" label="来源类型" initialValue="manual_note">
            <Select options={[
              { label: '手工记录', value: 'manual_note' },
              { label: '公司案例', value: 'company_case' },
              { label: '官方资料', value: 'official_document' },
              { label: '第三方数据', value: 'third_party_data' },
              { label: '竞品案例', value: 'competitor_product' },
              { label: '开源项目', value: 'open_source_project' },
              { label: 'SOP', value: 'sop' },
            ]} />
          </Form.Item>
          <Form.Item name="source_name" label="来源名称">
            <Input placeholder="资料来源、公司名、平台名或文件名" />
          </Form.Item>
          <Form.Item name="source_url" label="来源链接">
            <Input placeholder="可选，用于后续追溯" />
          </Form.Item>
          <Form.Item name="raw_text" label="资料正文" rules={[{ required: true, message: '请输入资料正文' }]}>
            <Input.TextArea rows={10} placeholder="粘贴资料内容、项目描述、案例拆解或SOP文本" />
          </Form.Item>
          <Form.Item name="industry_tags" label="初始行业标签">
            <Select mode="tags" placeholder="例如：工程建设、旅游文娱" />
          </Form.Item>
          <Form.Item name="business_topic_tags" label="初始业务主题标签">
            <Select mode="tags" placeholder="例如：招投标、AI影视、人员资质库" />
          </Form.Item>
          <Form.Item name="evidence_type_tags" label="初始证据类型">
            <Select mode="tags" placeholder="例如：真实项目经验、官方资料、竞品案例" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting}>入库并打标签</Button>
        </Form>
      </Card>
    </div>
  );
};

export default Intake;
```

- [ ] **Step 5: Run frontend build and fix compile errors**

Run:

```bash
cd frontend && npm run build
```

Expected: TypeScript build passes. If it fails on duplicate routes, remove the older `knowledge-assets` route entry and rerun.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/router/index.tsx frontend/src/components/Layout/index.tsx frontend/src/pages/KnowledgeAssets/index.tsx frontend/src/pages/KnowledgeAssets/Intake.tsx
git commit -m "feat: add knowledge asset library UI"
```

---

### Task 6: Frontend Asset Detail And AI Product Manager Page

**Files:**
- Create: `frontend/src/pages/KnowledgeAssets/Detail.tsx`
- Create: `frontend/src/pages/AIProductManager/index.tsx`
- Modify: `frontend/src/router/index.tsx`
- Modify: `frontend/src/components/Layout/index.tsx`

- [ ] **Step 1: Add asset detail page**

Create `frontend/src/pages/KnowledgeAssets/Detail.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { App, Button, Card, Descriptions, Form, Input, Select, Space, Tag, Typography } from 'antd';
import { useParams } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import '../BusinessWorkbench.css';

const { Title, Paragraph, Text } = Typography;

const Detail: React.FC = () => {
  const { id } = useParams();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [asset, setAsset] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const fetchAsset = async () => {
    const data = await request.get(`/knowledge-assets/${id}`);
    setAsset(data);
    form.setFieldsValue(data);
  };

  useEffect(() => {
    fetchAsset().catch(error => message.error(getApiErrorMessage(error, '获取知识资产失败')));
  }, [id]);

  const saveReview = async (values: any) => {
    setSaving(true);
    try {
      const updated = await request.put(`/knowledge-assets/${id}/review`, {
        ...values,
        manual_review_status: 'reviewed',
      });
      setAsset(updated);
      message.success('复核已保存');
    } catch (error) {
      message.error(getApiErrorMessage(error, '保存复核失败'));
    } finally {
      setSaving(false);
    }
  };

  if (!asset) return null;

  return (
    <div className="workbench-page">
      <section className="consulting-hero">
        <div className="consulting-hero-copy">
          <span className="dossier-code">Asset Review</span>
          <Title level={1}>{asset.title}</Title>
          <Text>复核标签、证据边界和迁移风险，确保后续 AI 产品经理引用的是受控数据。</Text>
        </div>
      </section>
      <Card className="consulting-table-card" title="来源与摘要">
        <Descriptions column={1}>
          <Descriptions.Item label="来源类型">{asset.source_type}</Descriptions.Item>
          <Descriptions.Item label="来源名称">{asset.source_name || '-'}</Descriptions.Item>
          <Descriptions.Item label="来源链接">{asset.source_url || '-'}</Descriptions.Item>
          <Descriptions.Item label="复核状态"><Tag color={asset.manual_review_status === 'reviewed' ? 'green' : 'orange'}>{asset.manual_review_status}</Tag></Descriptions.Item>
          <Descriptions.Item label="置信度">{Math.round(asset.confidence_score || 0)}</Descriptions.Item>
        </Descriptions>
        <Paragraph>{asset.summary}</Paragraph>
      </Card>
      <Card className="consulting-table-card" title="人工复核">
        <Form form={form} layout="vertical" onFinish={saveReview}>
          <Form.Item name="industry_tags" label="行业标签"><Select mode="tags" /></Form.Item>
          <Form.Item name="business_topic_tags" label="业务主题标签"><Select mode="tags" /></Form.Item>
          <Form.Item name="evidence_type_tags" label="证据类型标签"><Select mode="tags" /></Form.Item>
          <Form.Item name="value_tags" label="可用价值标签"><Select mode="tags" /></Form.Item>
          <Form.Item name="proves" label="这条资料能支撑什么"><Select mode="tags" /></Form.Item>
          <Form.Item name="does_not_prove" label="这条资料不能证明什么"><Select mode="tags" /></Form.Item>
          <Form.Item name="applicable_conditions" label="可复用条件"><Select mode="tags" /></Form.Item>
          <Form.Item name="migration_risks" label="迁移风险"><Select mode="tags" /></Form.Item>
          <Form.Item name="summary" label="摘要"><Input.TextArea rows={4} /></Form.Item>
          <Space><Button type="primary" htmlType="submit" loading={saving}>保存为已复核</Button></Space>
        </Form>
      </Card>
      <Card className="consulting-table-card" title="原始内容">
        <Paragraph>{asset.raw_text}</Paragraph>
      </Card>
    </div>
  );
};

export default Detail;
```

- [ ] **Step 2: Add AI product manager page**

Create `frontend/src/pages/AIProductManager/index.tsx`:

```tsx
import React, { useState } from 'react';
import { App, Button, Card, Col, Form, Input, List, Row, Space, Tag, Typography } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import request, { getApiErrorMessage } from '../../utils/request';
import '../BusinessWorkbench.css';

const { Title, Text, Paragraph } = Typography;

const AIProductManager: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<any>(null);

  const submit = async (values: any) => {
    setLoading(true);
    try {
      const data = await request.post('/ai-product-manager/draft', values, { timeout: 60000 });
      setDraft(data);
    } catch (error) {
      message.error(getApiErrorMessage(error, '生成方案草案失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="workbench-page">
      <section className="consulting-hero">
        <div className="consulting-hero-copy">
          <span className="dossier-code">AI Product Manager</span>
          <Title level={1}>AI 产品经理</Title>
          <Text>输入客户需求，系统先检索受控知识资产，再按固定结构输出方案假设、证据、追问和人工确认点。</Text>
        </div>
      </section>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card className="consulting-table-card" title="客户需求">
            <Form layout="vertical" onFinish={submit} initialValues={{ demand: '我们公司需要招投标相关优化' }}>
              <Form.Item name="demand" label="需求" rules={[{ required: true, message: '请输入客户需求' }]}>
                <Input.TextArea rows={5} placeholder="例如：我们公司需要招投标相关优化" />
              </Form.Item>
              <Form.Item name="company_profile" label="客户背景">
                <Input.TextArea rows={4} placeholder="行业、公司规模、现有流程、资料基础" />
              </Form.Item>
              <Form.Item name="constraints" label="约束">
                <Input.TextArea rows={3} placeholder="预算、周期、保密、必须使用的工具或流程" />
              </Form.Item>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={loading}>检索证据并生成草案</Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card className="consulting-table-card" title="受控方案草案">
            {draft ? (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <section>
                  <Text strong>需求理解</Text>
                  <Paragraph>{draft.demand_understanding}</Paragraph>
                </section>
                <section>
                  <Text strong>方案假设</Text>
                  <List dataSource={draft.solution_hypotheses || []} renderItem={(item: any) => (
                    <List.Item>
                      <List.Item.Meta title={item.name} description={<Paragraph>{item.why_reasonable || item.risk}</Paragraph>} />
                    </List.Item>
                  )} />
                </section>
                <section>
                  <Text strong>引用资产</Text>
                  <Space wrap>
                    {(draft.cited_assets || []).map((item: any) => <Tag key={item.asset.id}>{item.asset.title}</Tag>)}
                  </Space>
                </section>
                <section>
                  <Text strong>需要追问</Text>
                  <ul>{(draft.missing_questions || []).map((item: string) => <li key={item}>{item}</li>)}</ul>
                </section>
                <section>
                  <Text strong>下一步流程</Text>
                  <ol>{(draft.next_workflow || []).map((item: string) => <li key={item}>{item}</li>)}</ol>
                </section>
              </Space>
            ) : (
              <Text type="secondary">提交需求后，这里会展示检索证据和受控方案草案。</Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AIProductManager;
```

- [ ] **Step 3: Register route and menu**

Modify `frontend/src/router/index.tsx`:

```tsx
const AIProductManager = lazy(() => import('../pages/AIProductManager'));
...
      {
        path: 'ai-product-manager',
        element: lazyPage(<AIProductManager />),
      },
```

Modify `frontend/src/components/Layout/index.tsx`:

```tsx
    {
      key: '/ai-product-manager',
      icon: <RobotOutlined />,
      label: 'AI 产品经理',
    },
```

- [ ] **Step 4: Run frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/KnowledgeAssets/Detail.tsx frontend/src/pages/AIProductManager/index.tsx frontend/src/router/index.tsx frontend/src/components/Layout/index.tsx
git commit -m "feat: add ai product manager UI"
```

---

### Task 7: Final Verification And Branch Cleanup

**Files:**
- Test only, no planned code edits.

- [ ] **Step 1: Run backend knowledge asset tests**

Run:

```bash
backend/venv/bin/python -m pytest backend/tests/test_knowledge_assets.py -v
```

Expected: all tests in `test_knowledge_assets.py` pass.

- [ ] **Step 2: Run resume intelligence regression tests**

Run:

```bash
backend/venv/bin/python -m pytest backend/tests/test_resume_intelligence_service.py -v
```

Expected: all tests in `test_resume_intelligence_service.py` pass.

- [ ] **Step 3: Run frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short --branch
```

Expected: only intentional generated artifacts such as `output/` remain untracked, or the worktree is clean.

- [ ] **Step 5: Commit verification notes if files changed**

If verification required small fixes, commit them:

```bash
git add backend frontend
git commit -m "fix: stabilize knowledge asset control flow"
```

If no files changed, do not create an empty commit.
