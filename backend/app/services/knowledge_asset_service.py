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
        "招投标",
        "人员资质库",
        "工程造价",
        "结算审计",
        "项目资料管理",
        "AI影视",
        "短视频账号运营",
        "内容生产",
        "客户增长",
        "流程自动化",
        "风控合规",
        "数据看板",
        "内部效率系统",
    ]
    evidence_types = [
        "真实项目经验",
        "官方资料",
        "第三方数据",
        "竞品案例",
        "开源项目",
        "商业化产品",
        "SOP",
        "方法论",
        "待验证线索",
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
    confidence = _confidence_from_asset(
        payload.raw_text,
        {
            "industry_tags": industry_tags,
            "business_topic_tags": business_topic_tags,
            "evidence_type_tags": evidence_type_tags,
        },
    )
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
    parsed_data = resume.parsed_data or {}
    inferred = _infer_tags(_text_blob(title, raw_text, parsed_data))
    industry_tags = _unique([parsed_data.get("industry_label") or "", *inferred["industry_tags"]])
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
