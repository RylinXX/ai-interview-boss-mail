from __future__ import annotations

import os
import math
import re
import hashlib
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from uuid import UUID, uuid4

from fastapi import HTTPException, UploadFile
from fastapi.encoders import jsonable_encoder
from sqlalchemy import case, cast, func, or_
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session, load_only

from app.models.models import (
    KnowledgeAsset,
    KnowledgeAssetReviewStatus,
    Resume,
    SolutionAgentConversation,
    SolutionAgentMessage,
    SolutionAgentRun,
    SolutionAgentStep,
)
from app.schemas.knowledge_assets import (
    AIProductManagerDraftRequest,
    KnowledgeAssetIntakeRequest,
    KnowledgeAssetReviewUpdate,
    KnowledgeAssetSearchRequest,
    SolutionAgentRequest,
)
from app.services.ai_service import (
    generate_ai_product_manager_draft,
    generate_knowledge_asset_tags,
    generate_solution_agent_response,
)
from app.utils.file_storage import save_upload_file


SUPPORTED_KNOWLEDGE_UPLOAD_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".markdown"}
DEFAULT_CHUNK_SIZE = 1800
DEFAULT_CHUNK_OVERLAP = 180
DEFAULT_RRF_K = 60
DEFAULT_CONTEXT_CHAR_LIMIT = 900
DEFAULT_SEMANTIC_VECTOR_DIM = 256
MAX_KNOWLEDGE_ASSET_LIST_LIMIT = 100
MAX_KNOWLEDGE_ASSET_FILTER_SCAN = 100000

KNOWLEDGE_ASSET_LIST_COLUMNS = (
    KnowledgeAsset.id,
    KnowledgeAsset.title,
    KnowledgeAsset.source_type,
    KnowledgeAsset.source_name,
    KnowledgeAsset.source_confidentiality,
    KnowledgeAsset.summary,
    KnowledgeAsset.industry_tags,
    KnowledgeAsset.business_topic_tags,
    KnowledgeAsset.evidence_type_tags,
    KnowledgeAsset.proves,
    KnowledgeAsset.evidence_strength_score,
    KnowledgeAsset.data_verification_score,
    KnowledgeAsset.commercial_value_score,
    KnowledgeAsset.confidence_score,
    KnowledgeAsset.manual_review_status,
    KnowledgeAsset.created_at,
    KnowledgeAsset.updated_at,
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


def _source_excerpt(text: Optional[str], max_length: int = 320) -> str:
    cleaned = " ".join((text or "").split())
    return cleaned[:max_length]


def _build_citation_id(asset: KnowledgeAsset, rank: Optional[int] = None) -> str:
    prefix = f"K{rank}" if rank is not None else "K"
    return f"{prefix}-{str(asset.id)[:8]}"


def _default_source_locator(
    *,
    source_name: Optional[str],
    source_file_path: Optional[str],
    chunk_index: int,
    chunk_total: int,
) -> str:
    source = source_name or source_file_path or "knowledge_asset"
    return f"{source}#chunk-{chunk_index + 1}-of-{max(chunk_total, 1)}"


def _source_payload(
    asset: KnowledgeAsset,
    *,
    citation_id: Optional[str] = None,
    match_score: Optional[float] = None,
    match_reason: Optional[str] = None,
) -> Dict[str, Any]:
    payload = {
        "citation_id": citation_id or _build_citation_id(asset),
        "asset_id": str(asset.id),
        "title": asset.title,
        "source_type": asset.source_type,
        "source_name": asset.source_name,
        "source_url": asset.source_url,
        "source_file_path": asset.source_file_path,
        "source_document_id": asset.source_document_id,
        "chunk_index": asset.chunk_index or 0,
        "chunk_total": asset.chunk_total or 1,
        "source_page": asset.source_page,
        "source_section": asset.source_section,
        "source_locator": asset.source_locator,
        "excerpt": asset.source_excerpt or _source_excerpt(asset.raw_text or asset.summary),
    }
    if match_score is not None:
        payload["match_score"] = match_score
    if match_reason:
        payload["match_reason"] = match_reason
    return payload


def _tokenize_retrieval_text(text: str) -> List[str]:
    tokens = re.findall(r"[A-Za-z0-9_]+|[\u4e00-\u9fff]{2,}", (text or "").lower())
    return [token for token in tokens if len(token) >= 2]


def _semantic_features(text: str) -> List[str]:
    tokens = _tokenize_retrieval_text(text)
    features = list(tokens)
    for token in tokens:
        if len(token) >= 5 and re.match(r"^[a-z0-9_]+$", token):
            features.extend(token[index:index + 4] for index in range(0, len(token) - 3))
    return features


def _hash_feature_index(feature: str, dim: int = DEFAULT_SEMANTIC_VECTOR_DIM) -> int:
    digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big") % dim


def _semantic_vector(text: str, dim: int = DEFAULT_SEMANTIC_VECTOR_DIM) -> Dict[int, float]:
    vector: Dict[int, float] = {}
    for feature in _semantic_features(text):
        index = _hash_feature_index(feature, dim)
        vector[index] = vector.get(index, 0.0) + 1.0
    norm = math.sqrt(sum(value * value for value in vector.values()))
    if norm <= 0:
        return {}
    return {index: value / norm for index, value in vector.items()}


def _cosine_sparse(left: Dict[int, float], right: Dict[int, float]) -> float:
    if not left or not right:
        return 0.0
    if len(left) > len(right):
        left, right = right, left
    return sum(value * right.get(index, 0.0) for index, value in left.items())


def _bm25_query_terms(query: str, terms: List[str]) -> List[str]:
    values = [
        *_tokenize_retrieval_text(query),
        *(str(term).lower().strip() for term in terms),
    ]
    return _unique(value for value in values if len(value) >= 2)


def _compress_asset_context(asset: KnowledgeAsset, max_chars: int = DEFAULT_CONTEXT_CHAR_LIMIT) -> str:
    parts = [
        f"Title: {asset.title}",
        f"Source: {asset.source_name or asset.source_type}",
        f"Locator: {asset.source_locator or ''}",
        f"Summary: {asset.summary or ''}",
        f"Proves: {'; '.join(asset.proves or [])}",
        f"Limits: {'; '.join(asset.does_not_prove or [])}",
        f"Excerpt: {asset.source_excerpt or _source_excerpt(asset.raw_text or asset.summary, 520)}",
    ]
    compressed = " ".join(part for part in parts if part and part.strip())
    return compressed[:max_chars]


def _keyword_recall_items(
    rows: List[KnowledgeAsset],
    payload: KnowledgeAssetSearchRequest,
    terms: List[str],
    inferred: Dict[str, List[str]],
) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for asset in rows:
        if not _overlaps(payload.industry_tags, asset.industry_tags):
            continue
        if not _overlaps(payload.business_topic_tags, asset.business_topic_tags):
            continue
        if not _overlaps(payload.evidence_type_tags, asset.evidence_type_tags):
            continue
        match_score, match_reason = _score_asset_for_terms(asset, terms, inferred)
        if match_score <= 0:
            continue
        items.append(
            {
                "asset": asset,
                "match_score": match_score,
                "match_reason": match_reason,
            }
        )
    items.sort(key=lambda item: item["match_score"], reverse=True)
    return items


def _bm25_recall_items(
    rows: List[KnowledgeAsset],
    payload: KnowledgeAssetSearchRequest,
    query: str,
    terms: List[str],
) -> List[Dict[str, Any]]:
    query_terms = _bm25_query_terms(query, terms)
    if not query_terms:
        return []

    documents = []
    for asset in rows:
        if not _overlaps(payload.industry_tags, asset.industry_tags):
            continue
        if not _overlaps(payload.business_topic_tags, asset.business_topic_tags):
            continue
        if not _overlaps(payload.evidence_type_tags, asset.evidence_type_tags):
            continue
        blob = _asset_search_blob(asset).lower()
        documents.append(
            {
                "asset": asset,
                "blob": blob,
                "length": max(len(_tokenize_retrieval_text(blob)), 1),
            }
        )
    if not documents:
        return []

    total_docs = len(documents)
    avg_length = sum(item["length"] for item in documents) / total_docs
    document_frequency = {
        term: sum(1 for item in documents if term in item["blob"])
        for term in query_terms
    }
    results: List[Dict[str, Any]] = []
    k1 = 1.2
    b = 0.75

    for item in documents:
        score = 0.0
        matched_terms: List[str] = []
        for term in query_terms:
            tf = item["blob"].count(term)
            if tf <= 0:
                continue
            matched_terms.append(term)
            df = max(document_frequency.get(term, 0), 1)
            idf = math.log(1 + (total_docs - df + 0.5) / (df + 0.5))
            denominator = tf + k1 * (1 - b + b * (item["length"] / max(avg_length, 1)))
            score += idf * ((tf * (k1 + 1)) / max(denominator, 0.0001))
        if score <= 0:
            continue
        results.append(
            {
                "asset": item["asset"],
                "match_score": min(score * 25, 100.0),
                "match_reason": "BM25 terms: " + ", ".join(matched_terms[:6]),
            }
        )

    results.sort(key=lambda result: result["match_score"], reverse=True)
    return results


def _semantic_vector_recall_items(
    rows: List[KnowledgeAsset],
    payload: KnowledgeAssetSearchRequest,
    query: str,
    terms: List[str],
) -> List[Dict[str, Any]]:
    query_vector = _semantic_vector(_text_blob(query, terms))
    if not query_vector:
        return []

    results: List[Dict[str, Any]] = []
    for asset in rows:
        if not _overlaps(payload.industry_tags, asset.industry_tags):
            continue
        if not _overlaps(payload.business_topic_tags, asset.business_topic_tags):
            continue
        if not _overlaps(payload.evidence_type_tags, asset.evidence_type_tags):
            continue
        asset_vector = _semantic_vector(_asset_search_blob(asset))
        similarity = _cosine_sparse(query_vector, asset_vector)
        if similarity <= 0.01:
            continue
        results.append(
            {
                "asset": asset,
                "match_score": min(similarity * 100, 100.0),
                "match_reason": f"semantic cosine similarity {similarity:.3f}",
            }
        )

    results.sort(key=lambda result: result["match_score"], reverse=True)
    return results


def _rrf_fuse_results(route_results: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    fused: Dict[str, Dict[str, Any]] = {}
    for route_name, results in route_results.items():
        for rank, item in enumerate(results, start=1):
            asset = item["asset"]
            key = str(asset.id)
            entry = fused.setdefault(
                key,
                {
                    "asset": asset,
                    "route_scores": {},
                    "route_ranks": {},
                    "rrf_score": 0.0,
                    "match_reasons": [],
                },
            )
            entry["route_scores"][route_name] = item["match_score"]
            entry["route_ranks"][route_name] = rank
            entry["rrf_score"] += 1 / (DEFAULT_RRF_K + rank)
            if item.get("match_reason"):
                entry["match_reasons"].append(f"{route_name}: {item['match_reason']}")

    items: List[Dict[str, Any]] = []
    for entry in fused.values():
        route_scores = entry["route_scores"]
        best_route_score = max(route_scores.values()) if route_scores else 0.0
        items.append(
            {
                "asset": entry["asset"],
                "match_score": min(best_route_score + entry["rrf_score"] * 120, 100.0),
                "match_reason": "; ".join(entry["match_reasons"][:4]),
                "route_scores": route_scores,
                "route_ranks": entry["route_ranks"],
                "rrf_score": round(entry["rrf_score"], 6),
            }
        )
    items.sort(key=lambda item: (item["rrf_score"], item["match_score"]), reverse=True)
    return items


def _rerank_items(items: List[Dict[str, Any]], terms: List[str]) -> List[Dict[str, Any]]:
    normalized_terms = [str(term).lower().strip() for term in terms if str(term).strip()]
    for item in items:
        asset = item["asset"]
        title = (asset.title or "").lower()
        blob = _asset_search_blob(asset).lower()
        title_hits = sum(1 for term in normalized_terms if term and term in title)
        content_hits = sum(1 for term in normalized_terms if term and term in blob)
        confidence_bonus = min(float(asset.confidence_score or 0.0), 100.0) * 0.04
        evidence_bonus = min(float(asset.evidence_strength_score or 0.0), 100.0) * 0.03
        rerank_score = (
            float(item["match_score"])
            + title_hits * 3.0
            + content_hits * 0.8
            + confidence_bonus
            + evidence_bonus
        )
        item["rerank_score"] = round(rerank_score, 4)
        item["match_score"] = min(rerank_score, 100.0)
    items.sort(key=lambda item: item["rerank_score"], reverse=True)
    return items


def _parse_tag_input(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        values = value
    else:
        text = str(value)
        for separator in ("，", "、", ";", "；", "\n", "\t"):
            text = text.replace(separator, ",")
        values = text.split(",")
    return _unique(str(item).strip() for item in values if str(item).strip())


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
    ai_tags = generate_knowledge_asset_tags(payload.model_dump())
    inferred = _infer_tags(_text_blob(payload.title, payload.raw_text))
    industry_tags = _unique([*payload.industry_tags, *inferred["industry_tags"], *_as_list(ai_tags.get("industry_tags"))])
    business_topic_tags = _unique([*payload.business_topic_tags, *inferred["business_topic_tags"], *_as_list(ai_tags.get("business_topic_tags"))])
    evidence_type_tags = _unique([*payload.evidence_type_tags, *inferred["evidence_type_tags"], *_as_list(ai_tags.get("evidence_type_tags"))])
    score_dimensions = ai_tags.get("score_dimensions") if isinstance(ai_tags.get("score_dimensions"), dict) else {}
    confidence = float(score_dimensions.get("confidence_score") or _confidence_from_asset(
        payload.raw_text,
        {
            "industry_tags": industry_tags,
            "business_topic_tags": business_topic_tags,
            "evidence_type_tags": evidence_type_tags,
        },
    ))
    asset = KnowledgeAsset(
        title=payload.title,
        source_type=payload.source_type,
        source_name=payload.source_name,
        source_url=payload.source_url,
        source_file_path=payload.source_file_path,
        source_confidentiality=payload.source_confidentiality,
        source_document_id=payload.source_document_id or str(uuid4()),
        chunk_index=max(int(payload.chunk_index or 0), 0),
        chunk_total=max(int(payload.chunk_total or 1), 1),
        source_page=payload.source_page,
        source_section=payload.source_section,
        source_locator=payload.source_locator or _default_source_locator(
            source_name=payload.source_name,
            source_file_path=payload.source_file_path,
            chunk_index=max(int(payload.chunk_index or 0), 0),
            chunk_total=max(int(payload.chunk_total or 1), 1),
        ),
        source_excerpt=payload.source_excerpt or _source_excerpt(payload.raw_text),
        retrieval_metadata=payload.retrieval_metadata or {},
        raw_text=payload.raw_text,
        summary=ai_tags.get("summary") or payload.raw_text[:240],
        industry_tags=industry_tags,
        business_topic_tags=business_topic_tags,
        scenario_tags=_unique([*payload.scenario_tags, *_as_list(ai_tags.get("scenario_tags"))]),
        evidence_type_tags=evidence_type_tags,
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
        relevance_score=0.0,
        confidence_score=confidence,
        confidence_reason=ai_tags.get("confidence_reason") or "由入库文本和标签完整度计算，等待人工复核。",
        manual_review_status=KnowledgeAssetReviewStatus.UNREVIEWED,
        created_by=user_id,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


def _split_text_chunks(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> List[str]:
    clean = (text or "").strip()
    if not clean:
        return []
    if len(clean) <= chunk_size:
        return [clean]

    chunks: List[str] = []
    start = 0
    safe_overlap = max(0, min(overlap, chunk_size // 2))
    while start < len(clean):
        end = min(start + chunk_size, len(clean))
        chunk = clean[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(clean):
            break
        start = max(end - safe_overlap, start + 1)
    return chunks


def _read_uploaded_knowledge_text(file_path: str) -> str:
    from app.services.resume_service import read_file_content

    return read_file_content(file_path)


def create_assets_from_upload(
    db: Session,
    file: UploadFile,
    *,
    title: str,
    source_type: str = "manual_note",
    source_name: Optional[str] = None,
    source_url: Optional[str] = None,
    source_confidentiality: str = "internal",
    industry_tags: Any = None,
    business_topic_tags: Any = None,
    scenario_tags: Any = None,
    evidence_type_tags: Any = None,
    capability_tags: Any = None,
    methodology_tags: Any = None,
    customer_type_tags: Any = None,
    value_tags: Any = None,
    user_id: Optional[UUID] = None,
) -> List[KnowledgeAsset]:
    filename = file.filename or ""
    extension = os.path.splitext(filename)[1].lower()
    if extension not in SUPPORTED_KNOWLEDGE_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=400, detail="仅支持 PDF、DOCX、TXT、Markdown 资料上传")

    file_path = save_upload_file(file, "knowledge")
    raw_text = _read_uploaded_knowledge_text(file_path).strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="未能从资料文件中提取可用文本")

    chunks = _split_text_chunks(raw_text)
    assets: List[KnowledgeAsset] = []
    base_title = title.strip() or os.path.splitext(filename)[0] or "未命名资料"
    total = len(chunks)
    source_document_id = str(uuid4())

    for index, chunk in enumerate(chunks, start=1):
        chunk_index = index - 1
        asset_title = base_title if total == 1 else f"{base_title} - 片段 {index}"
        payload = KnowledgeAssetIntakeRequest(
            title=asset_title,
            source_type=source_type or "manual_note",
            source_name=source_name or filename,
            source_url=source_url,
            source_file_path=file_path,
            source_confidentiality=source_confidentiality or "internal",
            source_document_id=source_document_id,
            chunk_index=chunk_index,
            chunk_total=total,
            source_locator=_default_source_locator(
                source_name=source_name or filename,
                source_file_path=file_path,
                chunk_index=chunk_index,
                chunk_total=total,
            ),
            source_excerpt=_source_excerpt(chunk),
            retrieval_metadata={
                "original_filename": filename,
                "upload_title": base_title,
                "chunking_strategy": "fixed_window",
                "chunk_size": DEFAULT_CHUNK_SIZE,
                "chunk_overlap": DEFAULT_CHUNK_OVERLAP,
            },
            raw_text=chunk,
            industry_tags=_parse_tag_input(industry_tags),
            business_topic_tags=_parse_tag_input(business_topic_tags),
            scenario_tags=_parse_tag_input(scenario_tags),
            evidence_type_tags=_parse_tag_input(evidence_type_tags),
            capability_tags=_parse_tag_input(capability_tags),
            methodology_tags=_parse_tag_input(methodology_tags),
            customer_type_tags=_parse_tag_input(customer_type_tags),
            value_tags=_parse_tag_input(value_tags),
        )
        assets.append(create_manual_asset(db, payload, user_id))

    return assets


def list_assets(
    db: Session,
    query: Optional[str] = None,
    industry: Optional[str] = None,
    topic: Optional[str] = None,
    evidence_type: Optional[str] = None,
    review_status: Optional[str] = None,
    source_type: Optional[str] = None,
    limit: int = 24,
    offset: int = 0,
) -> Dict[str, Any]:
    safe_limit = max(1, min(int(limit or MAX_KNOWLEDGE_ASSET_LIST_LIMIT), MAX_KNOWLEDGE_ASSET_LIST_LIMIT))
    safe_offset = max(int(offset or 0), 0)
    q = db.query(KnowledgeAsset)
    if source_type:
        q = q.filter(KnowledgeAsset.source_type == source_type)
    if review_status:
        q = q.filter(KnowledgeAsset.manual_review_status == KnowledgeAssetReviewStatus(review_status))
    if query:
        like = f"%{query}%"
        q = q.filter(or_(KnowledgeAsset.title.ilike(like), KnowledgeAsset.summary.ilike(like), KnowledgeAsset.raw_text.ilike(like)))
    taxonomy_rows = q.with_entities(
        KnowledgeAsset.industry_tags,
        KnowledgeAsset.business_topic_tags,
        KnowledgeAsset.evidence_type_tags,
    ).all()
    industry_tags = _unique(tag for row in taxonomy_rows for tag in (row[0] or []))
    business_topic_tags = _unique(tag for row in taxonomy_rows for tag in (row[1] or []))
    evidence_type_tags = _unique(tag for row in taxonomy_rows for tag in (row[2] or []))

    needs_tag_filter = bool(industry or topic or evidence_type)
    is_postgresql = db.get_bind().dialect.name == "postgresql"
    if needs_tag_filter and is_postgresql:
        if industry:
            q = q.filter(cast(KnowledgeAsset.industry_tags, JSONB).contains([industry]))
        if topic:
            q = q.filter(cast(KnowledgeAsset.business_topic_tags, JSONB).contains([topic]))
        if evidence_type:
            q = q.filter(cast(KnowledgeAsset.evidence_type_tags, JSONB).contains([evidence_type]))

        total, reviewed, evidence_ready, high_confidence = q.with_entities(
            func.count(KnowledgeAsset.id),
            func.sum(case((KnowledgeAsset.manual_review_status == KnowledgeAssetReviewStatus.REVIEWED, 1), else_=0)),
            func.sum(case((KnowledgeAsset.evidence_strength_score >= 60, 1), else_=0)),
            func.sum(case((KnowledgeAsset.confidence_score >= 70, 1), else_=0)),
        ).one()
        items = q.options(load_only(*KNOWLEDGE_ASSET_LIST_COLUMNS)).order_by(
            KnowledgeAsset.updated_at.desc(),
            KnowledgeAsset.created_at.desc(),
        ).offset(safe_offset).limit(safe_limit).all()
    elif needs_tag_filter:
        # The tag columns are JSON on both SQLite and PostgreSQL. Filtering in
        # Python keeps test and development SQLite behavior aligned with PostgreSQL.
        candidates = q.options(load_only(*KNOWLEDGE_ASSET_LIST_COLUMNS)).order_by(
            KnowledgeAsset.updated_at.desc(),
            KnowledgeAsset.created_at.desc(),
        ).limit(MAX_KNOWLEDGE_ASSET_FILTER_SCAN).all()
        filtered = []
        for row in candidates:
            if industry and industry not in (row.industry_tags or []):
                continue
            if topic and topic not in (row.business_topic_tags or []):
                continue
            if evidence_type and evidence_type not in (row.evidence_type_tags or []):
                continue
            filtered.append(row)
        total = len(filtered)
        metric_rows = filtered
        items = filtered[safe_offset:safe_offset + safe_limit]
        reviewed = sum(1 for row in metric_rows if row.manual_review_status == KnowledgeAssetReviewStatus.REVIEWED)
        evidence_ready = sum(1 for row in metric_rows if float(row.evidence_strength_score or 0) >= 60)
        high_confidence = sum(1 for row in metric_rows if float(row.confidence_score or 0) >= 70)
    else:
        total, reviewed, evidence_ready, high_confidence = q.with_entities(
            func.count(KnowledgeAsset.id),
            func.sum(case((KnowledgeAsset.manual_review_status == KnowledgeAssetReviewStatus.REVIEWED, 1), else_=0)),
            func.sum(case((KnowledgeAsset.evidence_strength_score >= 60, 1), else_=0)),
            func.sum(case((KnowledgeAsset.confidence_score >= 70, 1), else_=0)),
        ).one()
        items = q.options(load_only(*KNOWLEDGE_ASSET_LIST_COLUMNS)).order_by(
            KnowledgeAsset.updated_at.desc(),
            KnowledgeAsset.created_at.desc(),
        ).offset(safe_offset).limit(safe_limit).all()

    total = int(total or 0)
    reviewed = int(reviewed or 0)
    evidence_ready = int(evidence_ready or 0)
    high_confidence = int(high_confidence or 0)

    return {
        "items": items,
        "total": total,
        "industry_tags": industry_tags,
        "business_topic_tags": business_topic_tags,
        "evidence_type_tags": evidence_type_tags,
        "metrics": {
            "asset_total": total,
            "reviewed": reviewed,
            "evidence_ready": evidence_ready,
            "high_confidence": high_confidence,
        },
    }


def _terms_for_query(query: str) -> List[str]:
    inferred = _infer_tags(query or "")
    token_text = query or ""
    for separator in ("，", "。", "、", ",", ".", "；", ";", "：", ":", "\n", "\t"):
        token_text = token_text.replace(separator, " ")
    tokens = [token for token in token_text.split() if len(token) >= 2]
    return _unique(
        [
            query,
            *tokens,
            *inferred["industry_tags"],
            *inferred["business_topic_tags"],
            *inferred["evidence_type_tags"],
        ]
    )


def _overlaps(requested: List[str], existing: Any) -> bool:
    if not requested:
        return True
    existing_values = set(_as_list(existing))
    return any(value in existing_values for value in requested)


def _asset_search_blob(asset: KnowledgeAsset) -> str:
    return _text_blob(
        asset.title,
        asset.summary,
        asset.raw_text,
        asset.industry_tags,
        asset.business_topic_tags,
        asset.scenario_tags,
        asset.evidence_type_tags,
        asset.capability_tags,
        asset.methodology_tags,
        asset.customer_type_tags,
        asset.value_tags,
        asset.proves,
        asset.applicable_conditions,
    )


def _score_asset_for_terms(asset: KnowledgeAsset, terms: List[str], inferred: Dict[str, List[str]]) -> tuple[float, str]:
    haystack = _asset_search_blob(asset).lower()
    title = (asset.title or "").lower()
    matched_terms: List[str] = []
    score = 0.0

    for term in terms:
        normalized = term.lower().strip()
        if not normalized or normalized not in haystack:
            continue
        matched_terms.append(term)
        score += 12.0
        if normalized in title:
            score += 8.0

    industry_hits = [tag for tag in inferred["industry_tags"] if tag in (asset.industry_tags or [])]
    topic_hits = [tag for tag in inferred["business_topic_tags"] if tag in (asset.business_topic_tags or [])]
    evidence_hits = [tag for tag in inferred["evidence_type_tags"] if tag in (asset.evidence_type_tags or [])]
    matched_terms = _unique([*matched_terms, *industry_hits, *topic_hits, *evidence_hits])

    score += len(industry_hits) * 15.0
    score += len(topic_hits) * 18.0
    score += len(evidence_hits) * 8.0
    if score > 0:
        score += min(float(asset.evidence_strength_score or 0.0), 100.0) * 0.12
        score += min(float(asset.data_verification_score or 0.0), 100.0) * 0.08
        score += min(float(asset.commercial_value_score or 0.0), 100.0) * 0.06

    reason = "匹配关键词：" + "、".join(matched_terms[:6]) if matched_terms else "与需求文本存在弱相关"
    return min(score, 100.0), reason


def _build_retrieval_log(
    *,
    query: str,
    terms: List[str],
    limit: int,
    total_candidates: int,
    items: List[Dict[str, Any]],
    route_counts: Optional[Dict[str, int]] = None,
) -> Dict[str, Any]:
    compressed_contexts = [_compress_asset_context(item["asset"]) for item in items]
    return {
        "original_query": query,
        "rewritten_query": query,
        "retrieval_mode": "hybrid_keyword_bm25_semantic",
        "selected_tools": [
            "knowledge_asset_keyword_search",
            "knowledge_asset_bm25_search",
            "knowledge_asset_semantic_vector_search",
            "rrf_fusion",
            "heuristic_reranker",
            "context_compressor",
        ],
        "terms": terms,
        "limit": limit,
        "candidate_count": total_candidates,
        "route_counts": route_counts or {},
        "rrf": {"k": DEFAULT_RRF_K},
        "semantic_vector": {
            "provider": "local_hashing_vectorizer",
            "dimension": DEFAULT_SEMANTIC_VECTOR_DIM,
        },
        "rerank": {"strategy": "heuristic_title_content_confidence"},
        "context_compression": {
            "max_chars_per_asset": DEFAULT_CONTEXT_CHAR_LIMIT,
            "included_count": len(items),
            "total_chars": sum(len(context) for context in compressed_contexts),
        },
        "returned_count": len(items),
        "results": [
            {
                "rank": index + 1,
                "asset_id": str(item["asset"].id),
                "citation_id": _build_citation_id(item["asset"], index + 1),
                "title": item["asset"].title,
                "match_score": item["match_score"],
                "match_reason": item["match_reason"],
                "route_scores": item.get("route_scores", {}),
                "route_ranks": item.get("route_ranks", {}),
                "rrf_score": item.get("rrf_score", 0),
                "rerank_score": item.get("rerank_score", item["match_score"]),
                "source_document_id": item["asset"].source_document_id,
                "source_locator": item["asset"].source_locator,
                "chunk_index": item["asset"].chunk_index or 0,
                "chunk_total": item["asset"].chunk_total or 1,
            }
            for index, item in enumerate(items)
        ],
    }


def search_assets(db: Session, payload: KnowledgeAssetSearchRequest) -> Dict[str, Any]:
    query = (payload.query or "").strip()
    inferred = _infer_tags(query)
    terms = _terms_for_query(query)
    safe_limit = max(1, min(int(payload.limit or 8), 30))
    rows = (
        db.query(KnowledgeAsset)
        .order_by(KnowledgeAsset.updated_at.desc(), KnowledgeAsset.created_at.desc())
        .limit(500)
        .all()
    )

    keyword_items = _keyword_recall_items(rows, payload, terms, inferred)
    bm25_items = _bm25_recall_items(rows, payload, query, terms)
    semantic_items = _semantic_vector_recall_items(rows, payload, query, terms)
    fused_items = _rrf_fuse_results(
        {
            "keyword_tag": keyword_items,
            "bm25_text": bm25_items,
            "semantic_vector": semantic_items,
        }
    )
    reranked_items = _rerank_items(fused_items, terms)
    ranked_items = reranked_items[:safe_limit]
    for index, item in enumerate(ranked_items, start=1):
        item["rank"] = index
    return {
        "query": payload.query,
        "items": ranked_items,
        "retrieval_log": _build_retrieval_log(
            query=query,
            terms=terms,
            limit=safe_limit,
            total_candidates=len(fused_items),
            items=ranked_items,
            route_counts={
                "keyword_tag": len(keyword_items),
                "bm25_text": len(bm25_items),
                "semantic_vector": len(semantic_items),
                "fused": len(fused_items),
            },
        ),
    }


def _asset_evidence_payload(item: Dict[str, Any]) -> Dict[str, Any]:
    asset = item["asset"]
    rank = item.get("rank")
    citation_id = _build_citation_id(asset, rank)
    return {
        "id": str(asset.id),
        "citation_id": citation_id,
        "title": asset.title,
        "source_type": asset.source_type,
        "source_name": asset.source_name,
        "source_url": asset.source_url,
        "source_file_path": asset.source_file_path,
        "source_document_id": asset.source_document_id,
        "chunk_index": asset.chunk_index or 0,
        "chunk_total": asset.chunk_total or 1,
        "source_page": asset.source_page,
        "source_section": asset.source_section,
        "source_locator": asset.source_locator,
        "source_excerpt": asset.source_excerpt or _source_excerpt(asset.raw_text or asset.summary),
        "compressed_context": _compress_asset_context(asset),
        "summary": asset.summary,
        "industry_tags": asset.industry_tags or [],
        "business_topic_tags": asset.business_topic_tags or [],
        "evidence_type_tags": asset.evidence_type_tags or [],
        "value_tags": asset.value_tags or [],
        "proves": asset.proves or [],
        "does_not_prove": asset.does_not_prove or [],
        "applicable_conditions": asset.applicable_conditions or [],
        "migration_risks": asset.migration_risks or [],
        "scores": {
            "match_score": item["match_score"],
            "evidence_strength_score": asset.evidence_strength_score or 0.0,
            "data_verification_score": asset.data_verification_score or 0.0,
            "commercial_value_score": asset.commercial_value_score or 0.0,
            "confidence_score": asset.confidence_score or 0.0,
        },
        "match_reason": item["match_reason"],
        "source_payload": _source_payload(
            asset,
            citation_id=citation_id,
            match_score=item["match_score"],
            match_reason=item["match_reason"],
        ),
    }


def _asset_to_solution_evidence(item: Dict[str, Any]) -> Dict[str, Any]:
    asset = item["asset"]
    rank = item.get("rank")
    citation_id = _build_citation_id(asset, rank)
    return {
        "id": str(asset.id),
        "citation_id": citation_id,
        "title": asset.title,
        "source_type": asset.source_type,
        "source_name": asset.source_name,
        "source_url": asset.source_url,
        "source_file_path": asset.source_file_path,
        "source_document_id": asset.source_document_id,
        "chunk_index": asset.chunk_index or 0,
        "chunk_total": asset.chunk_total or 1,
        "source_page": asset.source_page,
        "source_section": asset.source_section,
        "source_locator": asset.source_locator,
        "source_excerpt": asset.source_excerpt or _source_excerpt(asset.raw_text or asset.summary),
        "compressed_context": _compress_asset_context(asset),
        "summary": asset.summary,
        "raw_text": asset.raw_text,
        "industry_tags": asset.industry_tags or [],
        "business_topic_tags": asset.business_topic_tags or [],
        "evidence_type_tags": asset.evidence_type_tags or [],
        "proves": asset.proves or [],
        "does_not_prove": asset.does_not_prove or [],
        "applicable_conditions": asset.applicable_conditions or [],
        "migration_risks": asset.migration_risks or [],
        "match_score": item["match_score"],
        "match_reason": item["match_reason"],
        "source_payload": _source_payload(
            asset,
            citation_id=citation_id,
            match_score=item["match_score"],
            match_reason=item["match_reason"],
        ),
    }


def _solution_agent_missing_questions(
    payload: SolutionAgentRequest,
    coverage: Dict[str, Any],
) -> List[str]:
    base_questions: List[str] = []
    if not (payload.company_profile or "").strip():
        base_questions.append("客户所在行业、公司规模和当前业务流程是什么？")
    if not (payload.requirement or "").strip() or coverage["score"] < 40:
        base_questions.append("这次方案优先解决效率、收入、风控还是交付标准化？")
    if not (payload.project_materials or "").strip():
        base_questions.append("客户现有系统、表格或资料库分别在哪里？")
    if not (payload.constraints or "").strip():
        base_questions.append("哪些资料可以对外引用，哪些只能内部参考？")

    base_questions.extend(
        [
            "客户现有系统、表格或资料库分别在哪里？",
            "是否有模板文件、字段样例、历史方案或真实案例可以补充？",
            "本次输出要进入内部评审、客户汇报还是直接交付？",
        ]
    )
    return _unique(base_questions)


def _solution_agent_next_actions(coverage: Dict[str, Any]) -> List[str]:
    actions = [
        "补充客户现有资料清单、字段样例和模板文件",
        "补充至少一个可公开或可匿名引用的同类案例",
        "人工复核资料来源、适用边界和对外表述",
    ]
    if coverage["score"] >= 70:
        actions.append("把方案草案转成客户案卷并生成执行任务")
    else:
        actions.append("补齐证据后重新运行方案 Agent")
    return actions


def _assess_solution_agent_coverage(
    payload: SolutionAgentRequest,
    evidence: List[Dict[str, Any]],
) -> Dict[str, Any]:
    covered: List[str] = []
    missing: List[str] = []

    if evidence:
        covered.append("已有相近案例或资料")
    else:
        missing.append("可引用案例或资料")

    if any(item.get("source_type") for item in evidence):
        covered.append("资料来源类型")
    else:
        missing.append("资料来源类型")

    if any(item.get("business_topic_tags") for item in evidence):
        covered.append("业务主题标签")
    else:
        missing.append("业务主题标签")

    if any(item.get("evidence_type_tags") for item in evidence):
        covered.append("证据类型标签")
    else:
        missing.append("证据类型标签")

    if (payload.company_profile or "").strip():
        covered.append("客户背景")
    else:
        missing.append("客户背景")

    if (payload.project_materials or "").strip():
        covered.append("客户项目资料")
    else:
        missing.append("客户现有系统和数据字段")

    if (payload.constraints or "").strip():
        covered.append("约束条件")
    else:
        missing.append("约束条件")

    missing.extend(
        [
            "客户现有系统和数据字段",
            "当前业务基线指标",
            "一期验收标准",
            "资料授权和对外引用边界",
        ]
    )

    if not evidence:
        score = 0
    else:
        score = min(100, len(covered) * 8)
    if score >= 70:
        level = "strong"
    elif score >= 40:
        level = "partial"
    else:
        level = "insufficient"

    return {
        "score": score,
        "level": level,
        "covered": covered,
        "missing": missing,
        "requires_more_evidence": score < 40,
    }


def _solution_agent_trace(
    *,
    evidence_count: int,
    coverage: Dict[str, Any],
    model_used: bool,
    worker_count: int,
) -> List[Dict[str, str]]:
    if coverage["requires_more_evidence"]:
        assess_status = "blocked"
        generate_status = "skipped"
        generate_summary = "证据不足，已跳过模型方案生成，先要求补充资料。"
    else:
        assess_status = "needs_review" if coverage["score"] < 70 else "completed"
        generate_status = "completed" if model_used else "fallback"
        generate_summary = "已调用大模型生成方案草案。" if model_used else "模型不可用，已生成规则兜底方案。"

    return [
        {
            "stage": "understand_requirement",
            "status": "completed",
            "summary": "已提取客户需求、公司背景、项目资料和约束条件。",
        },
        {
            "stage": "retrieve_evidence",
            "status": "completed" if evidence_count else "empty",
            "summary": f"检索到 {evidence_count} 条知识资产。",
        },
        {
            "stage": "assess_coverage",
            "status": assess_status,
            "summary": f"证据覆盖率 {coverage['score']}%，仍需补充 {len(coverage['missing'])} 类信息。",
        },
        {
            "stage": "generate_solution",
            "status": generate_status,
            "summary": generate_summary,
        },
        {
            "stage": "assign_dynamic_workers",
            "status": "completed" if worker_count else "skipped",
            "summary": f"已生成 {worker_count} 个动态 AI 执行员工。",
        },
    ]


def _solution_agent_crew_trace(
    *,
    payload: SolutionAgentRequest,
    evidence: List[Dict[str, Any]],
    coverage: Dict[str, Any],
    retrieval_log: Dict[str, Any],
    model_used: bool,
    worker_count: int,
) -> List[Dict[str, Any]]:
    writer_status = "skipped" if coverage.get("requires_more_evidence") else ("completed" if model_used else "fallback")
    return [
        {
            "stage": "understand_requirement",
            "agent_role": "requirement_analyst",
            "status": "completed",
            "summary": "Extracted requirement, customer context, materials, constraints, and confirmed context.",
            "inputs": {
                "requirement": payload.requirement,
                "has_company_profile": bool((payload.company_profile or "").strip()),
                "has_project_materials": bool((payload.project_materials or "").strip()),
                "has_constraints": bool((payload.constraints or "").strip()),
            },
            "outputs": {
                "query_terms": retrieval_log.get("terms", []),
            },
        },
        {
            "stage": "retrieve_evidence",
            "agent_role": "evidence_researcher",
            "status": "completed",
            "summary": f"Retrieved {len(evidence)} evidence items through hybrid search.",
            "inputs": {
                "retrieval_mode": retrieval_log.get("retrieval_mode"),
                "selected_tools": retrieval_log.get("selected_tools", []),
            },
            "outputs": {
                "retrieval_mode": retrieval_log.get("retrieval_mode"),
                "route_counts": retrieval_log.get("route_counts", {}),
                "returned_count": retrieval_log.get("returned_count", len(evidence)),
            },
        },
        {
            "stage": "assess_coverage",
            "agent_role": "evidence_critic",
            "status": "blocked" if coverage.get("requires_more_evidence") else ("needs_review" if coverage.get("score", 0) < 70 else "completed"),
            "summary": f"Evidence coverage is {coverage.get('score', 0)}% with level {coverage.get('level')}.",
            "inputs": {
                "evidence_count": len(evidence),
            },
            "outputs": {
                "covered": coverage.get("covered", []),
                "missing": coverage.get("missing", []),
            },
        },
        {
            "stage": "generate_solution",
            "agent_role": "solution_writer",
            "status": writer_status,
            "summary": "Generated the solution draft from cited evidence." if model_used else "Used fallback or skipped generation due to evidence status.",
            "inputs": {
                "compressed_context_count": len([item for item in evidence if item.get("compressed_context")]),
            },
            "outputs": {
                "model_used": model_used,
            },
        },
        {
            "stage": "assign_dynamic_workers",
            "agent_role": "delivery_task_designer",
            "status": "completed" if worker_count else "needs_review",
            "summary": f"Prepared {worker_count} dynamic delivery workers for execution handoff.",
            "inputs": {
                "solution_ready": not coverage.get("requires_more_evidence"),
            },
            "outputs": {
                "worker_count": worker_count,
            },
        },
    ]


def _normalize_dict_list(value: Any, fallback: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return fallback
    rows = [item for item in value if isinstance(item, dict)]
    return rows or fallback


def _fallback_product_manager_draft(
    payload: AIProductManagerDraftRequest,
    retrieved: Dict[str, Any],
) -> Dict[str, Any]:
    cited_items = retrieved["items"]
    cited_ids = [str(item["asset"].id) for item in cited_items]
    primary_topics = _unique(
        tag
        for item in cited_items
        for tag in (item["asset"].business_topic_tags or [])
    )
    primary_topic = primary_topics[0] if primary_topics else "当前需求"
    evidence_summary = [
        f"{item['asset'].title}：{item['asset'].summary or item['asset'].raw_text or '该资产缺少摘要，需要人工补充。'}"
        for item in cited_items[:5]
    ]

    if cited_items:
        solution_hypotheses = [
            {
                "name": f"{primary_topic}资料与流程优化方案",
                "why_it_may_work": "系统已检索到相近行业或主题的项目经验、资料或方法论，可作为可行性讨论的初始证据。",
                "required_data": [
                    "客户现有资料清单",
                    "当前流程节点和人工耗时",
                    "已有系统或表格数据结构",
                    "可验证的效率、收入或成本指标",
                ],
                "suggested_workflow": [
                    "确认客户真实场景和优化目标",
                    "补充同类案例、官方资料或第三方数据",
                    "把可复用模块拆成SOP或PRD草案",
                    "让人工复核证据强度后再进入开发或交付流程",
                ],
                "cited_asset_ids": cited_ids,
            }
        ]
    else:
        solution_hypotheses = [
            {
                "name": "先建立需求证据包",
                "why_it_may_work": "当前知识库没有足够匹配的证据，先补数据可以降低AI直接产出泛化方案的风险。",
                "required_data": ["行业资料", "真实案例", "竞品或开源项目", "客户现有流程"],
                "suggested_workflow": ["补充资料", "重新检索", "人工复核", "再生成方案草稿"],
                "cited_asset_ids": [],
            }
        ]

    return {
        "demand_understanding": f"用户希望围绕“{payload.demand}”形成有证据支撑、可继续追问和拆解的方案方向。",
        "evidence_summary": evidence_summary or ["当前知识库缺少可直接支撑该需求的资产，需要先补充资料。"],
        "solution_hypotheses": solution_hypotheses,
        "missing_questions": [
            "客户所属行业、公司规模和当前业务流程是什么？",
            "这个需求优先解决效率、收入、风控还是交付标准化问题？",
            "现有数据来源、数据质量和可授权使用范围是什么？",
            "是否已有对标公司、商业化产品、开源项目或官方资料？",
        ],
        "human_confirmation_points": [
            "检索到的资产是否真的适用于当前客户场景",
            "证据是否足以支持进入SOP、PRD或开发方案",
            "哪些数据可以对客户展示，哪些只能内部参考",
        ],
        "next_workflow": [
            "补全客户需求上下文",
            "扩充并复核行业知识资产",
            "输出SOP或PRD草案",
            "由AI员工执行资料整理、竞品对比或开发拆解任务",
        ],
        "cited_assets": cited_items,
        "model_used": False,
        "fallback_used": True,
    }


def generate_controlled_product_manager_draft(db: Session, payload: AIProductManagerDraftRequest) -> Dict[str, Any]:
    search_query = _text_blob(payload.demand, payload.company_profile, payload.constraints)
    retrieved = search_assets(
        db,
        KnowledgeAssetSearchRequest(
            query=search_query,
            limit=payload.limit,
        ),
    )
    fallback = _fallback_product_manager_draft(payload, retrieved)
    draft_payload = {
        "demand": payload.demand,
        "company_profile": payload.company_profile,
        "constraints": payload.constraints,
        "confirmed_context": payload.confirmed_context,
        "evidence_assets": [_asset_evidence_payload(item) for item in retrieved["items"]],
    }
    generated = generate_ai_product_manager_draft(draft_payload)
    if not generated:
        return fallback

    return {
        "demand_understanding": generated.get("demand_understanding") or fallback["demand_understanding"],
        "evidence_summary": _as_list(generated.get("evidence_summary")) or fallback["evidence_summary"],
        "solution_hypotheses": _normalize_dict_list(
            generated.get("solution_hypotheses"),
            fallback["solution_hypotheses"],
        ),
        "missing_questions": _as_list(generated.get("missing_questions")) or fallback["missing_questions"],
        "human_confirmation_points": _as_list(generated.get("human_confirmation_points")) or fallback["human_confirmation_points"],
        "next_workflow": _as_list(generated.get("next_workflow")) or fallback["next_workflow"],
        "cited_assets": retrieved["items"],
        "model_used": True,
        "fallback_used": False,
    }


def _normalize_solution_list(value: Any) -> List[str]:
    return _as_list(value)


def _fallback_solution_agent_response(
    payload: SolutionAgentRequest,
    retrieved: Dict[str, Any],
) -> Dict[str, Any]:
    evidence = [_asset_to_solution_evidence(item) for item in retrieved["items"]]
    coverage = _assess_solution_agent_coverage(payload, evidence)
    clarifying_questions = _solution_agent_missing_questions(payload, coverage)
    next_actions = _solution_agent_next_actions(coverage)
    primary = evidence[0] if evidence else {}
    primary_title = primary.get("title") or "当前资料"
    topic_tags = _unique(tag for item in evidence for tag in item.get("business_topic_tags", []))
    primary_topic = topic_tags[0] if topic_tags else "客户需求"
    related_cases = [item["title"] for item in evidence[:4] if item.get("title")]

    solution = {
        "title": f"{primary_topic}证据化解决方案",
        "summary": (
            f"基于知识资产库中“{primary_title}”等资料，先形成可复核的方案假设，"
            "再由人工确认业务边界、资料真实性和交付承诺。"
            if evidence else
            "当前知识资产库缺少足够证据，建议先补充报告、案例、官方资料或客户现有文档。"
        ),
        "recommended_solutions": [
            {
                "name": f"{primary_topic}资料治理与方案生成工作台",
                "scenario": payload.requirement,
                "value": "把外部资料、内部经验和客户材料统一沉淀为可引用证据，减少泛化方案和重复整理。",
                "related_cases": related_cases,
                "implementation_steps": [
                    "资料入库并按片段拆分",
                    "标注来源、可信度和适用边界",
                    "检索相关证据生成方案草稿",
                    "人工复核事实、风险和交付范围",
                    "生成客户案卷和执行任务",
                ],
            }
        ],
        "needed_capabilities": ["资料治理", "证据检索", "方案设计", "人工复核", "交付拆解"],
        "risks": [
            "资料来源和适用范围需要人工确认",
            "外部报告结论不能直接当作客户承诺",
        ],
        "next_questions": [
            "客户现有资料包含哪些格式和来源？",
            "本次优先解决效率、获客、风控还是交付标准化？",
            "哪些资料可以对外引用，哪些只能内部参考？",
        ],
        "knowledge_context": {
            "asset_count": len(evidence),
            "assets": evidence[:6],
        },
        "dynamic_workers": [
            {
                "name": "资料解析员工",
                "responsibility": "读取客户资料、外部报告和内部样本，拆分成可引用证据",
                "human_review": "人工确认资料来源、敏感信息和适用范围",
            },
            {
                "name": "方案设计员工",
                "responsibility": "基于证据生成方案方向、模块和落地步骤",
                "human_review": "人工确认客户承诺、预算边界和一期范围",
            },
            {
                "name": "交付拆解员工",
                "responsibility": "把方案拆成任务板、验收指标和报告章节",
                "human_review": "人工验收最终交付物",
            },
        ],
    }
    evidence_self_check, unsupported_claims = _apply_solution_evidence_self_check(solution, evidence)
    return {
        "assistant_message": f"我从知识资产库检索到 {len(evidence)} 条相关证据，建议先生成「{solution['title']}」。",
        "solution": solution,
        "retrieved_evidence": evidence,
        "dynamic_workers": solution["dynamic_workers"],
        "human_decision_points": [
            "人工确认引用资料是否适合当前客户场景",
            "人工确认资料真实性、敏感边界和对外表述",
            "人工确认最终交付范围和客户承诺",
        ],
        "evidence_self_check": evidence_self_check,
        "unsupported_claims": unsupported_claims,
        "agent_trace": _solution_agent_trace(
            evidence_count=len(evidence),
            coverage=coverage,
            model_used=False,
            worker_count=len(solution["dynamic_workers"]),
        ),
        "crew_trace": _solution_agent_crew_trace(
            payload=payload,
            evidence=evidence,
            coverage=coverage,
            retrieval_log=retrieved.get("retrieval_log", {}),
            model_used=False,
            worker_count=len(solution["dynamic_workers"]),
        ),
        "retrieval_log": retrieved.get("retrieval_log", {}),
        "evidence_coverage": coverage,
        "clarifying_questions": clarifying_questions,
        "next_actions": next_actions,
        "model_used": False,
        "fallback_used": True,
    }


def _normalize_dynamic_workers(solution: Dict[str, Any]) -> List[Dict[str, str]]:
    workers = solution.get("dynamic_workers")
    if isinstance(workers, list) and workers:
        return [
            {
                "name": str(item.get("name") or "AI 执行员工"),
                "responsibility": str(item.get("responsibility") or "根据方案承担具体执行任务"),
                "human_review": str(item.get("human_review") or "关键结论由人工审核确认"),
            }
            for item in workers
            if isinstance(item, dict)
        ]
    return [
        {
            "name": "资料解析员工",
            "responsibility": "整理资料、证据和缺口",
            "human_review": "人工确认资料边界",
        },
        {
            "name": "方案设计员工",
            "responsibility": "生成方案模块和落地步骤",
            "human_review": "人工确认方案承诺",
        },
    ]


def _match_evidence_references(
    references: Iterable[Any],
    evidence: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    matched: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for ref in references:
        normalized = str(ref or "").strip().lower()
        if not normalized:
            continue
        for item in evidence:
            values = [
                item.get("id"),
                item.get("citation_id"),
                item.get("title"),
                item.get("source_name"),
            ]
            if any(normalized == str(value or "").strip().lower() for value in values):
                evidence_id = str(item.get("id"))
            elif any(normalized in str(value or "").strip().lower() for value in [item.get("title"), item.get("source_name")]):
                evidence_id = str(item.get("id"))
            else:
                continue
            if evidence_id not in seen:
                matched.append(item)
                seen.add(evidence_id)
            break
    return matched


def _apply_solution_evidence_self_check(
    solution: Dict[str, Any],
    evidence: List[Dict[str, Any]],
) -> tuple[Dict[str, Any], List[Dict[str, Any]]]:
    recommended = solution.get("recommended_solutions")
    if not isinstance(recommended, list):
        recommended = []
        solution["recommended_solutions"] = recommended

    unsupported: List[Dict[str, Any]] = []
    cited_count = 0
    for item in recommended:
        if not isinstance(item, dict):
            continue
        explicit_refs = [
            *_as_list(item.get("cited_asset_ids")),
            *_as_list(item.get("cited_citation_ids")),
        ]
        inferred_refs = _as_list(item.get("related_cases"))
        matched = _match_evidence_references(explicit_refs, evidence)
        if not matched:
            matched = _match_evidence_references(inferred_refs, evidence)

        if matched:
            cited_count += 1
            item["cited_asset_ids"] = _unique(str(match.get("id")) for match in matched if match.get("id"))
            item["cited_citation_ids"] = _unique(str(match.get("citation_id")) for match in matched if match.get("citation_id"))
            item["citation_status"] = "supported"
        else:
            item["cited_asset_ids"] = []
            item["cited_citation_ids"] = []
            item["citation_status"] = "needs_evidence"
            unsupported.append(
                {
                    "name": item.get("name") or item.get("scenario") or "unnamed_solution",
                    "scenario": item.get("scenario"),
                    "value": item.get("value"),
                    "reason": "No retrieved evidence citation matched this solution direction.",
                }
            )

    total = len([item for item in recommended if isinstance(item, dict)])
    self_check = {
        "status": "passed" if not unsupported else "needs_review",
        "total_solution_count": total,
        "cited_solution_count": cited_count,
        "uncited_solution_count": len(unsupported),
        "unsupported_claims": unsupported,
    }
    solution["evidence_self_check"] = self_check
    return self_check, unsupported


def _solution_agent_conversation_title(requirement: str) -> str:
    text = " ".join((requirement or "").split())
    return text[:80] or "Solution Agent Conversation"


def _get_or_create_solution_agent_conversation(
    db: Session,
    payload: SolutionAgentRequest,
    user_id: Optional[UUID],
) -> SolutionAgentConversation:
    if payload.conversation_id:
        conversation = (
            db.query(SolutionAgentConversation)
            .filter(SolutionAgentConversation.id == payload.conversation_id)
            .first()
        )
        if not conversation:
            raise HTTPException(status_code=404, detail="Solution agent conversation not found")
        if user_id and conversation.created_by and conversation.created_by != user_id:
            raise HTTPException(status_code=404, detail="Solution agent conversation not found")
        return conversation

    conversation = SolutionAgentConversation(
        title=_solution_agent_conversation_title(payload.requirement),
        last_requirement=payload.requirement,
        message_count=0,
        created_by=user_id,
        last_active_at=datetime.utcnow(),
    )
    db.add(conversation)
    db.flush()
    return conversation


def _solution_agent_run_status(result: Dict[str, Any]) -> str:
    coverage = result.get("evidence_coverage") or {}
    if coverage.get("requires_more_evidence"):
        return "blocked"
    if result.get("fallback_used"):
        return "fallback"
    return "completed"


def _persist_solution_agent_interaction(
    db: Session,
    payload: SolutionAgentRequest,
    result: Dict[str, Any],
    user_id: Optional[UUID],
) -> Dict[str, Any]:
    if not user_id:
        return result

    conversation = _get_or_create_solution_agent_conversation(db, payload, user_id)
    now = datetime.utcnow()
    run = SolutionAgentRun(
        conversation_id=conversation.id,
        status=_solution_agent_run_status(result),
        requirement=payload.requirement,
        request_payload=jsonable_encoder(payload.model_dump()),
        response_payload=jsonable_encoder(result),
        retrieval_log=jsonable_encoder(result.get("retrieval_log") or {}),
        evidence_coverage=jsonable_encoder(result.get("evidence_coverage") or {}),
        model_used=bool(result.get("model_used")),
        fallback_used=bool(result.get("fallback_used")),
        created_by=user_id,
        started_at=now,
        completed_at=now,
    )
    db.add(run)
    db.flush()

    user_message = SolutionAgentMessage(
        conversation_id=conversation.id,
        run_id=run.id,
        role="user",
        content=payload.requirement,
        payload=jsonable_encoder(payload.model_dump()),
    )
    assistant_message = SolutionAgentMessage(
        conversation_id=conversation.id,
        run_id=run.id,
        role="assistant",
        content=result.get("assistant_message") or "",
        payload=jsonable_encoder(result.get("solution") or {}),
        sources=jsonable_encoder(result.get("retrieved_evidence") or []),
        agent_trace=jsonable_encoder(result.get("agent_trace") or []),
        retrieval_log=jsonable_encoder(result.get("retrieval_log") or {}),
    )
    db.add(user_message)
    db.add(assistant_message)

    trace_steps = result.get("crew_trace") or result.get("agent_trace") or []
    for index, trace in enumerate(trace_steps, start=1):
        step_output = jsonable_encoder(trace.get("outputs") or trace)
        if trace.get("agent_role"):
            step_output["agent_role"] = trace.get("agent_role")
        db.add(
            SolutionAgentStep(
                run_id=run.id,
                step_index=index,
                stage=str(trace.get("stage") or f"step_{index}"),
                status=str(trace.get("status") or "completed"),
                summary=trace.get("summary"),
                input=jsonable_encoder(trace.get("inputs") or ({"requirement": payload.requirement} if index == 1 else {})),
                output=step_output,
                elapsed_ms=0,
            )
        )

    conversation.last_requirement = payload.requirement
    conversation.message_count = int(conversation.message_count or 0) + 2
    conversation.last_active_at = now
    conversation.updated_at = now
    db.commit()
    db.refresh(run)
    db.refresh(user_message)
    db.refresh(assistant_message)

    return {
        **result,
        "conversation_id": str(conversation.id),
        "run_id": str(run.id),
        "user_message_id": str(user_message.id),
        "assistant_message_id": str(assistant_message.id),
    }


def _conversation_to_dict(conversation: SolutionAgentConversation) -> Dict[str, Any]:
    return {
        "id": str(conversation.id),
        "title": conversation.title,
        "last_requirement": conversation.last_requirement,
        "message_count": conversation.message_count or 0,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
        "last_active_at": conversation.last_active_at,
    }


def list_solution_agent_conversations(
    db: Session,
    user_id: UUID,
    limit: int = 50,
) -> Dict[str, Any]:
    safe_limit = max(1, min(int(limit or 50), 100))
    rows = (
        db.query(SolutionAgentConversation)
        .filter(SolutionAgentConversation.created_by == user_id)
        .order_by(SolutionAgentConversation.last_active_at.desc())
        .limit(safe_limit)
        .all()
    )
    return {"items": [_conversation_to_dict(row) for row in rows], "total": len(rows)}


def get_solution_agent_messages(
    db: Session,
    user_id: UUID,
    conversation_id: UUID,
) -> Dict[str, Any]:
    conversation = (
        db.query(SolutionAgentConversation)
        .filter(
            SolutionAgentConversation.id == conversation_id,
            SolutionAgentConversation.created_by == user_id,
        )
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Solution agent conversation not found")
    messages = (
        db.query(SolutionAgentMessage)
        .filter(SolutionAgentMessage.conversation_id == conversation_id)
        .order_by(SolutionAgentMessage.created_at.asc())
        .all()
    )
    return {
        "conversation": _conversation_to_dict(conversation),
        "items": [
            {
                "id": str(message.id),
                "conversation_id": str(message.conversation_id),
                "run_id": str(message.run_id) if message.run_id else None,
                "role": message.role,
                "content": message.content,
                "payload": message.payload or {},
                "sources": message.sources or [],
                "agent_trace": message.agent_trace or [],
                "retrieval_log": message.retrieval_log or {},
                "created_at": message.created_at,
            }
            for message in messages
        ],
        "total": len(messages),
    }


def delete_solution_agent_conversation(
    db: Session,
    user_id: UUID,
    conversation_id: UUID,
) -> Dict[str, Any]:
    conversation = (
        db.query(SolutionAgentConversation)
        .filter(
            SolutionAgentConversation.id == conversation_id,
            SolutionAgentConversation.created_by == user_id,
        )
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Solution agent conversation not found")

    db.query(SolutionAgentMessage).filter(SolutionAgentMessage.conversation_id == conversation_id).delete()
    db.query(SolutionAgentRun).filter(SolutionAgentRun.conversation_id == conversation_id).delete()
    db.delete(conversation)
    db.commit()
    return {"status": "success", "id": str(conversation_id)}


def get_solution_agent_run(
    db: Session,
    user_id: UUID,
    run_id: UUID,
) -> Dict[str, Any]:
    run = (
        db.query(SolutionAgentRun)
        .filter(SolutionAgentRun.id == run_id, SolutionAgentRun.created_by == user_id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Solution agent run not found")
    return {
        "id": str(run.id),
        "conversation_id": str(run.conversation_id),
        "status": run.status,
        "requirement": run.requirement,
        "request_payload": run.request_payload or {},
        "response_payload": run.response_payload or {},
        "retrieval_log": run.retrieval_log or {},
        "evidence_coverage": run.evidence_coverage or {},
        "model_used": bool(run.model_used),
        "fallback_used": bool(run.fallback_used),
        "error": run.error,
        "started_at": run.started_at,
        "completed_at": run.completed_at,
        "steps": [
            {
                "id": str(step.id),
                "step_index": step.step_index,
                "stage": step.stage,
                "status": step.status,
                "summary": step.summary,
                "agent_role": (step.output or {}).get("agent_role"),
                "input": step.input or {},
                "output": step.output or {},
                "elapsed_ms": step.elapsed_ms or 0,
                "created_at": step.created_at,
            }
            for step in run.steps
        ],
    }


def _format_knowledge_asset_solution_markdown(payload: SolutionAgentRequest, solution: Dict[str, Any], evidence: List[Dict[str, Any]]) -> str:
    llm_markdown = solution.get("assistant_message")
    if llm_markdown and isinstance(llm_markdown, str) and len(llm_markdown.strip()) > 30:
        return llm_markdown.strip()

    title = solution.get("title") or "AI 业务解决方案"
    summary = solution.get("summary") or "基于检索到的知识资产与项目经验为您生成的系统解决方案。"

    md_lines = [
        f"### 🎯 一、 需求分析与方案定位：{title}",
        f"**需求内容**: {payload.requirement.strip()}",
        f"**方案定位与概述**: {summary}\n",
        "### 💡 二、 核心交付方案与业务逻辑",
    ]

    rec_solutions = solution.get("recommended_solutions") or []
    for idx, item in enumerate(rec_solutions, start=1):
        md_lines.append(f"#### {idx}. {item.get('name', '系统方案方向')}")
        if item.get('scenario'):
            md_lines.append(f"- **应用场景**: {item.get('scenario')}")
        if item.get('value'):
            md_lines.append(f"- **核心商业价值**: {item.get('value')}")
        steps = item.get('implementation_steps') or []
        if steps:
            md_lines.append(f"- **落地实施步骤**: {' ➔ '.join(steps)}")
        md_lines.append("")

    md_lines.append("### 📚 三、 私有数据库线索与真实依据引述")
    if evidence:
        for idx, item in enumerate(evidence[:6], start=1):
            title_text = item.get('title') or item.get('source_name') or item.get('candidate_name') or item.get('project_name') or '知识资产'
            source_type = item.get('source_type') or '数据库实体'
            summary_text = item.get('summary') or item.get('solution') or item.get('match_reason') or '匹配线索'
            md_lines.append(f"- **[引用 {idx}] {source_type}**: 《{title_text}》（线索摘要: {summary_text}）")
    else:
        md_lines.append("- 当前知识资产库中未匹配到可作为直接证据的条目，建议充实资产库样本。\n")

    md_lines.append("\n### ⚠️ 四、 假设前提与已知风险边界")
    risks = solution.get("risks") or ["方案交付范围与数据边界需要人工审查确认"]
    for r in risks:
        md_lines.append(f"- {r}")

    md_lines.append("\n### 🚀 五、 实施落地与交付拆解")
    next_q = solution.get("next_questions") or ["客户当前最核心的交付诉求是什么？"]
    for q in next_q:
        md_lines.append(f"- ❓ **追问建议**: {q}")

    return "\n".join(md_lines)


def generate_solution_agent(
    db: Session,
    payload: SolutionAgentRequest,
    user_id: Optional[UUID] = None,
) -> Dict[str, Any]:
    query = _text_blob(
        payload.requirement,
        payload.company_profile,
        payload.project_materials,
        payload.constraints,
        payload.confirmed_context,
    )
    retrieved = search_assets(
        db,
        KnowledgeAssetSearchRequest(query=query, limit=payload.limit),
    )
    fallback = _fallback_solution_agent_response(payload, retrieved)
    evidence = [_asset_to_solution_evidence(item) for item in retrieved["items"]]
    coverage = _assess_solution_agent_coverage(payload, evidence)
    clarifying_questions = _solution_agent_missing_questions(payload, coverage)
    next_actions = _solution_agent_next_actions(coverage)
    agent_payload = {
        "user_profile": {
            "requirement": payload.requirement,
            "company_profile": payload.company_profile,
            "project_materials": payload.project_materials,
            "constraints": payload.constraints,
            "confirmed_context": payload.confirmed_context,
        },
        "knowledge_context": {
            "source": "knowledge_assets",
            "asset_count": len(evidence),
            "assets": evidence,
        },
        "instruction": (
            "你是一个基于私有知识与经验大纲解题的大语言模型 AI 解决方案助手。"
            "请基于用户需求和检索到的上下文生成专业落地方案，不要编造未提供的事实。请严格返回 JSON。"
        ),
    }
    generated = generate_solution_agent_response(agent_payload)
    if not generated:
        result = {
            **fallback,
            "agent_trace": _solution_agent_trace(
                evidence_count=len(evidence),
                coverage=coverage,
                model_used=False,
                worker_count=len(fallback["dynamic_workers"]),
            ),
            "retrieval_log": retrieved.get("retrieval_log", {}),
            "evidence_coverage": coverage,
            "clarifying_questions": clarifying_questions,
            "next_actions": next_actions,
        }
        return _persist_solution_agent_interaction(db, payload, result, user_id)

    solution = {
        "title": generated.get("title") or fallback["solution"]["title"],
        "summary": generated.get("summary") or fallback["solution"]["summary"],
        "recommended_solutions": _normalize_dict_list(
            generated.get("recommended_solutions"),
            fallback["solution"]["recommended_solutions"],
        ),
        "needed_capabilities": _normalize_solution_list(generated.get("needed_capabilities")) or fallback["solution"]["needed_capabilities"],
        "risks": _normalize_solution_list(generated.get("risks")) or fallback["solution"]["risks"],
        "next_questions": _normalize_solution_list(generated.get("next_questions")) or fallback["solution"]["next_questions"],
        "knowledge_context": {
            "source": "knowledge_assets",
            "asset_count": len(evidence),
            "assets": evidence[:6],
        },
    }
    dynamic_workers = _normalize_dynamic_workers(generated)
    solution["dynamic_workers"] = dynamic_workers
    human_points = [
        "人工确认引用资料是否适合当前客户场景",
        "人工确认资料真实性、敏感边界和对外表述",
        "人工确认最终交付范围和客户承诺",
        *(worker["human_review"] for worker in dynamic_workers if worker.get("human_review")),
    ]
    evidence_self_check, unsupported_claims = _apply_solution_evidence_self_check(solution, evidence)

    assistant_message = _format_knowledge_asset_solution_markdown(payload, solution, evidence)
    result = {
        "assistant_message": assistant_message,
        "solution": solution,
        "retrieved_evidence": evidence,
        "dynamic_workers": dynamic_workers,
        "human_decision_points": _unique(human_points),
        "evidence_self_check": evidence_self_check,
        "unsupported_claims": unsupported_claims,
        "agent_trace": _solution_agent_trace(
            evidence_count=len(evidence),
            coverage=coverage,
            model_used=True,
            worker_count=len(dynamic_workers),
        ),
        "crew_trace": _solution_agent_crew_trace(
            payload=payload,
            evidence=evidence,
            coverage=coverage,
            retrieval_log=retrieved.get("retrieval_log", {}),
            model_used=True,
            worker_count=len(dynamic_workers),
        ),
        "retrieval_log": retrieved.get("retrieval_log", {}),
        "evidence_coverage": coverage,
        "clarifying_questions": clarifying_questions,
        "next_actions": next_actions,
        "model_used": True,
        "fallback_used": False,
    }
    return _persist_solution_agent_interaction(db, payload, result, user_id)


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
