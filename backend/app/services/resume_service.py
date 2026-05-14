from sqlalchemy.orm import Session, joinedload
from app.models.models import (
    CodingSubmission, CodingTest, Resume, Position, Interview, InterviewPanel,
    DepartmentReview, User, Offer, ResumeMailImport,
    ResumeStatus, ScreeningResult, RejectReasonCategory, ReviewRecommendation
)
from app.schemas.resume import (
    ResumeCreate, ResumeUpdate, ScreeningResult as ScreeningResultSchema,
    ResumeStatus as ResumeStatusSchema, DepartmentReviewCreate,
    DepartmentReviewUpdate, HRDecisionCreate, DuplicateCheckRequest
)
from uuid import UUID
from fastapi import UploadFile, HTTPException
from app.utils.file_storage import save_upload_file
from app.services.ai_service import (
    analyze_resume_intelligence,
    analyze_resume_intelligence_from_document,
    analyze_resume_positioning,
    extract_resume_text_from_document,
    extract_resume_text_from_images,
    generate_resume_markdown,
    generate_solution_agent_response,
)
from app.services.task_queue import get_task_queue
from app.services.knowledge_asset_service import sync_resume_knowledge_assets
from app.config.resume_industry import (
    DEFAULT_RESUME_INDUSTRY,
    RESUME_INDUSTRY_PROFILES,
    normalize_resume_industry,
)
import base64
import docx
import PyPDF2
import os
import re
import json
from collections import Counter
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
from sqlalchemy import or_, and_, func


INDUSTRY_LABEL_PROFILES = RESUME_INDUSTRY_PROFILES
DEFAULT_INDUSTRY_LABEL = DEFAULT_RESUME_INDUSTRY


def _extract_pdf_text(file_path: str) -> str:
    content = ""
    with open(file_path, 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            content += page.extract_text() or ""
    return content


def _looks_like_unreadable_pdf_text(text: str) -> bool:
    stripped = (text or "").strip()
    if not stripped:
        return True

    lines = [line.strip() for line in stripped.splitlines() if line.strip()]
    if len(lines) < 6:
        return False

    repeated_line_count = Counter(lines).most_common(1)[0][1]
    unique_ratio = len(set(lines)) / len(lines)
    if repeated_line_count >= 5 and unique_ratio <= 0.35:
        return True

    tokenish_lines = sum(
        1
        for line in lines
        if re.fullmatch(r"[A-Fa-f0-9]{8,}[A-Za-z0-9_~=-]{12,}", line)
    )
    return tokenish_lines / len(lines) >= 0.5


def _render_pdf_pages_as_data_urls(file_path: str, max_pages: int = 4) -> List[str]:
    try:
        import fitz
    except Exception as exc:
        print(f"PyMuPDF is not available for PDF image fallback: {exc}")
        return []

    data_urls = []
    doc = fitz.open(file_path)
    try:
        for page_index in range(min(len(doc), max_pages)):
            page = doc[page_index]
            pix = page.get_pixmap(matrix=fitz.Matrix(0.75, 0.75), alpha=False)
            jpeg = pix.tobytes("jpeg")
            encoded = base64.b64encode(jpeg).decode("ascii")
            data_urls.append(f"data:image/jpeg;base64,{encoded}")
    finally:
        doc.close()
    return data_urls


def _extract_pdf_text_with_vision(file_path: str) -> str:
    images = _render_pdf_pages_as_data_urls(file_path)
    if not images:
        return ""
    return extract_resume_text_from_images(images)


def read_file_content(file_path: str) -> str:
    _, ext = os.path.splitext(file_path)
    content = ""
    try:
        if ext == '.docx':
            doc = docx.Document(file_path)
            content = '\n'.join([para.text for para in doc.paragraphs])
        elif ext == '.pdf':
            try:
                content = extract_resume_text_from_document(file_path)
            except Exception as e:
                print(f"Model document extraction unavailable: {e}")
                content = ""
            if not content:
                content = _extract_pdf_text(file_path)
                if _looks_like_unreadable_pdf_text(content):
                    vision_content = _extract_pdf_text_with_vision(file_path)
                    if vision_content:
                        content = vision_content
        elif ext in ('.txt', '.md', '.markdown'):
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        else:
            print(f"Unsupported file type: {ext}")
    except Exception as e:
        print(f"Error reading file {file_path}: {e}")
    return content

from app.config.database import SessionLocal
from fastapi import BackgroundTasks


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _is_pdf_file(file_path: str) -> bool:
    return os.path.splitext(file_path or "")[1].lower() == ".pdf"


def _raw_text_from_direct_analysis(parsed_data: Dict[str, Any]) -> str:
    raw_text = parsed_data.get("raw_text") or parsed_data.get("resume_text")
    if raw_text:
        return str(raw_text)
    return json.dumps(parsed_data, ensure_ascii=False)


def _is_meaningful_value(value: Any) -> bool:
    return value not in (None, "", [], {})


def _copy_positioning_fields(target: Dict[str, Any], source: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(target)
    profile = normalize_resume_industry(source)
    if profile:
        result.update(
            {
                "industry_key": profile["key"],
                "industry_label": profile["label"],
                "industry_color": profile["color"],
            }
        )

    copy_keys = (
        "positioning_summary",
        "positioning_reason",
        "business_domain",
        "business_keywords",
        "business_stage",
        "target_customer",
        "customer_type",
    )
    alias_keys = {
        "summary": "positioning_summary",
        "reason": "positioning_reason",
    }
    for key in copy_keys:
        if _is_meaningful_value(source.get(key)):
            result[key] = source[key]
    for source_key, target_key in alias_keys.items():
        if _is_meaningful_value(source.get(source_key)) and not result.get(target_key):
            result[target_key] = source[source_key]
    return result


def _positioning_item_for_index(items: Any, index: int) -> Dict[str, Any]:
    candidates = [item for item in _as_list(items) if isinstance(item, dict)]
    for item in candidates:
        raw_index = item.get("index")
        if raw_index is not None and _safe_int(raw_index, -1) in (index, index + 1):
            return item
    if index < len(candidates):
        return candidates[index]
    return {}


def _merge_positioning_items(parsed_data: Dict[str, Any], positioning_data: Dict[str, Any], field: str) -> None:
    items = _as_list(parsed_data.get(field))
    if not items:
        return

    positioned_items = []
    positioning_items = positioning_data.get(field)
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            positioned_items.append(item)
            continue
        positioned_items.append(
            _copy_positioning_fields(item, _positioning_item_for_index(positioning_items, index))
        )
    parsed_data[field] = positioned_items


def _merge_resume_positioning(parsed_data: Dict[str, Any], positioning_data: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(positioning_data, dict) or not positioning_data:
        return parsed_data

    merged = dict(parsed_data)
    merged["positioning_analysis"] = positioning_data
    merged = _copy_positioning_fields(merged, positioning_data)

    _merge_positioning_items(merged, positioning_data, "work_experiences")
    _merge_positioning_items(merged, positioning_data, "project_experiences")

    logic_positioning = positioning_data.get("logic_analysis")
    if isinstance(logic_positioning, dict):
        profile = normalize_resume_industry(logic_positioning)
        if profile:
            merged["logic_industry_key"] = profile["key"]
            merged["logic_industry_label"] = profile["label"]
            merged["logic_industry_color"] = profile["color"]
        for key in ("positioning_summary", "positioning_reason"):
            if _is_meaningful_value(logic_positioning.get(key)):
                merged[f"logic_{key}"] = logic_positioning[key]

    return merged


def _build_resume_intelligence_review(parsed_data: Dict[str, Any]) -> str:
    sections = []

    positioning_lines = []
    if parsed_data.get("industry_label"):
        positioning_lines.append(f"- 定位标签：{parsed_data['industry_label']}")
    if parsed_data.get("positioning_summary"):
        positioning_lines.append(f"- 定位摘要：{parsed_data['positioning_summary']}")
    if parsed_data.get("positioning_reason"):
        positioning_lines.append(f"- 定位依据：{parsed_data['positioning_reason']}")
    if positioning_lines:
        sections.append("### 定位分析\n" + "\n".join(positioning_lines))

    if parsed_data.get("experience_summary"):
        sections.append(f"### 经历概要\n{parsed_data['experience_summary']}")

    project_evaluation = parsed_data.get("project_evaluation") or {}
    if isinstance(project_evaluation, dict) and project_evaluation.get("summary"):
        sections.append(f"### 项目评估\n{project_evaluation['summary']}")

    if parsed_data.get("logic_analysis"):
        sections.append(f"### 底层逻辑分析\n{parsed_data['logic_analysis']}")

    questions = _as_list(parsed_data.get("interview_questions"))[:5]
    if questions:
        lines = []
        for item in questions:
            if isinstance(item, dict):
                question = item.get("question")
                purpose = item.get("purpose")
                if question:
                    lines.append(f"- {question}" + (f"（{purpose}）" if purpose else ""))
            elif item:
                lines.append(f"- {item}")
        if lines:
            sections.append("### 关键追问\n" + "\n".join(lines))

    business_questions = _as_list(parsed_data.get("business_model_questions"))[:5]
    if business_questions:
        lines = []
        for item in business_questions:
            if isinstance(item, dict):
                question = item.get("question")
                purpose = item.get("purpose")
                if question:
                    lines.append(f"- {question}" + (f"（{purpose}）" if purpose else ""))
            elif item:
                lines.append(f"- {item}")
        if lines:
            sections.append("### 商业模式追问\n" + "\n".join(lines))

    company_ideas = _as_list(parsed_data.get("company_optimization_ideas"))[:5]
    if company_ideas:
        sections.append("### 公司优化建议\n" + "\n".join(f"- {item}" for item in company_ideas if item))

    startup_ideas = _as_list(parsed_data.get("startup_landing_ideas"))[:5]
    if startup_ideas:
        sections.append("### 创业落地方案\n" + "\n".join(f"- {item}" for item in startup_ideas if item))

    return "\n\n".join(section for section in sections if section).strip()


def _apply_resume_intelligence(resume: Resume, parsed_data: Dict[str, Any], raw_text: str, use_user_info: bool) -> None:
    contact_info = parsed_data.get("contact_info", {})
    if isinstance(contact_info, dict):
        contact = contact_info.get("phone") or parsed_data.get("contact") or ""
        email = contact_info.get("email") or parsed_data.get("email") or ""
    else:
        contact = parsed_data.get("contact", "")
        email = parsed_data.get("email", "")

    if not use_user_info:
        resume.candidate_name = parsed_data.get("candidate_name") or "未识别"
        resume.contact = contact
        resume.email = email or None

    project_evaluation = parsed_data.get("project_evaluation")
    project_score = project_evaluation.get("score") if isinstance(project_evaluation, dict) else None

    resume.parsed_data = parsed_data
    resume.match_score = _safe_int(
        parsed_data.get("evaluation_score")
        or project_score
        or parsed_data.get("match_score")
    )
    resume.screening_result = ScreeningResult.PASSED
    resume.ai_review = _build_resume_intelligence_review(parsed_data)
    resume.resume_markdown = generate_resume_markdown(raw_text)
    resume.parse_status = "success"
    resume.parse_error = None
    resume.parsed_at = datetime.utcnow()
    resume.status = ResumeStatus.COMPLETED


def process_resume_task(payload: Dict[str, Any]):
    resume_id = payload["resume_id"]
    use_user_info = payload.get("use_user_info", False)

    db = SessionLocal()
    try:
        resume = db.query(Resume).filter(Resume.id == resume_id).first()
        if not resume:
            return
        resume.parse_status = "processing"
        resume.parse_error = None
        db.commit()

        parsed_data = {}
        content = ""
        if _is_pdf_file(resume.file_path):
            parsed_data = analyze_resume_intelligence_from_document(resume.file_path)
            if parsed_data:
                content = _raw_text_from_direct_analysis(parsed_data)

        if not parsed_data:
            content = read_file_content(resume.file_path)
            if not content:
                resume.parse_status = "failed"
                resume.parse_error = "读取简历内容失败"
                db.commit()
                return
            parsed_data = analyze_resume_intelligence(content)

        if not parsed_data:
            resume.parse_status = "failed"
            resume.parse_error = "AI 解析失败"
            db.commit()
            return

        positioning_data = analyze_resume_positioning(content, parsed_data)
        parsed_data = _merge_resume_positioning(parsed_data, positioning_data)

        _apply_resume_intelligence(resume, parsed_data, content, use_user_info)
        resume.raw_text = content
        sync_resume_knowledge_assets(db, resume)
        db.commit()

    except Exception as e:
        try:
            resume = db.query(Resume).filter(Resume.id == resume_id).first()
            if resume:
                resume.parse_status = "failed"
                resume.parse_error = str(e)[:500]
                db.commit()
        finally:
            pass
    finally:
        db.close()


def on_resume_parse_failure(payload: Dict[str, Any], error: str):
    resume_id = payload["resume_id"]
    db = SessionLocal()
    try:
        resume = db.query(Resume).filter(Resume.id == resume_id).first()
        if resume:
            resume.parse_status = "failed"
            resume.parse_error = f"解析失败（重试后）: {error[:400]}"
            resume.candidate_name = "解析失败"
            db.commit()
            print(f"[TaskQueue] Updated resume {resume_id} status to failed")
    except Exception as e:
        print(f"[TaskQueue] Failed to update resume status: {e}")
    finally:
        db.close()


def process_resume_background(resume_id: UUID, position_id: Optional[UUID] = None, use_user_info: bool = False):
    queue = get_task_queue()
    queue.submit(
        task_id=str(resume_id),
        task_type="resume_parse",
        payload={
            "resume_id": resume_id,
            "position_id": position_id,
            "use_user_info": use_user_info,
        },
        callback=process_resume_task,
        on_failure=on_resume_parse_failure,
    )

def upload_resume(db: Session, file: UploadFile, position_id: Optional[UUID], background_tasks: BackgroundTasks,
                  candidate_name: str = None, email: str = None, contact: str = None):
    """
    上传简历
    - 公开链接上传时，candidate_name/email/contact 由应聘者填写，解析时不会覆盖
    - 后台上传时，这些字段为空，解析时会从简历中提取
    """
    # 1. Save file
    file_path = save_upload_file(file, "resumes")

    # 2. Create initial record
    # 如果有应聘者填写的信息，直接使用；否则显示"解析中..."
    db_resume = Resume(
        file_path=file_path,
        position_id=position_id,
        status=ResumeStatus.PENDING_SCREENING,
        candidate_name=candidate_name or "解析中...",
        email=email or None,
        contact=contact or None,
        parse_status="processing",
    )

    db.add(db_resume)
    db.commit()
    db.refresh(db_resume)

    # 3. Add background task - 传递是否使用用户填写的信息标记
    use_user_info = bool(candidate_name or email or contact)
    background_tasks.add_task(process_resume_background, db_resume.id, position_id, use_user_info)

    return db_resume

def batch_upload_resumes(db: Session, files: List[UploadFile], position_id: Optional[UUID], background_tasks: BackgroundTasks):
    uploaded_resumes = []
    for file in files:
        resume = upload_resume(db, file, position_id, background_tasks)
        uploaded_resumes.append(resume)
    return uploaded_resumes

def reparse_resume(db: Session, resume_id: UUID, background_tasks: BackgroundTasks):
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        return None

    resume.parse_status = "processing"
    resume.parse_error = None
    resume.parsed_at = None
    resume.parsed_data = None
    resume.match_score = None
    resume.ai_review = None
    resume.screening_result = ScreeningResult.PENDING
    resume.status = ResumeStatus.PENDING_SCREENING
    resume.candidate_name = "解析中..."
    resume.contact = None
    resume.email = None
    db.commit()
    db.refresh(resume)

    background_tasks.add_task(process_resume_background, resume.id, resume.position_id)
    return resume

def reparse_failed_resumes(db: Session, background_tasks: BackgroundTasks, limit: int = 50) -> Dict[str, Any]:
    safe_limit = max(1, min(int(limit or 50), 100))
    failed_resumes = (
        db.query(Resume)
        .filter(Resume.parse_status == "failed")
        .order_by(Resume.created_at.desc())
        .limit(safe_limit)
        .all()
    )

    queued_ids = []
    skipped_ids = []
    for resume in failed_resumes:
        reparse_resume(db, resume.id, background_tasks)
        queued_ids.append(str(resume.id))

    return {
        "total_failed": len(failed_resumes),
        "queued_count": len(queued_ids),
        "skipped_count": len(skipped_ids),
        "resume_ids": queued_ids,
        "skipped_resume_ids": skipped_ids,
    }


def _attach_resume_context(item: Any, resume: Resume) -> Optional[Dict[str, Any]]:
    if not isinstance(item, dict):
        return None
    return {
        **item,
        "resume_id": str(resume.id),
        "candidate_name": resume.candidate_name,
        "created_at": resume.created_at.isoformat() if resume.created_at else None,
    }


def _match_industry_label(text: str) -> Dict[str, str]:
    lowered = (text or "").lower()
    scored = []
    for profile in INDUSTRY_LABEL_PROFILES:
        score = sum(4 for keyword in profile.get("strong_keywords", []) if keyword.lower() in lowered)
        score += sum(1 for keyword in profile.get("keywords", []) if keyword.lower() in lowered)
        if score:
            scored.append((score, profile))

    if not scored:
        return DEFAULT_INDUSTRY_LABEL

    scored.sort(key=lambda item: item[0], reverse=True)
    best = scored[0][1]
    return {
        "key": best["key"],
        "label": best["label"],
        "color": best["color"],
    }


def _structured_industry_for_item(item: Any) -> Optional[Dict[str, str]]:
    if not isinstance(item, dict):
        return None
    return normalize_resume_industry(item)


def _industry_context_for_resume(resume: Resume) -> Dict[str, str]:
    parsed_data = resume.parsed_data or {}
    structured = (
        normalize_resume_industry(parsed_data)
        or normalize_resume_industry(parsed_data.get("positioning_analysis"))
    )
    if structured:
        return structured

    return _match_industry_label(
        _text_blob(
            resume.candidate_name,
            parsed_data.get("recent_company"),
            parsed_data.get("experience_summary"),
            parsed_data.get("logic_analysis"),
            parsed_data.get("company_optimization_ideas"),
            parsed_data.get("startup_landing_ideas"),
            parsed_data.get("work_experiences"),
            parsed_data.get("project_experiences"),
        )
    )


def _with_industry_fields(item: Dict[str, Any], industry: Dict[str, str]) -> Dict[str, Any]:
    profile = normalize_resume_industry(industry) or DEFAULT_INDUSTRY_LABEL
    return {
        **item,
        "industry_key": profile["key"],
        "industry_label": profile["label"],
        "industry_color": profile["color"],
    }


def _industry_summary_from_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    summary: Dict[str, Dict[str, Any]] = {}
    for item in items:
        key = item.get("industry_key") or DEFAULT_INDUSTRY_LABEL["key"]
        if key not in summary:
            summary[key] = {
                "industry_key": key,
                "industry_label": item.get("industry_label") or DEFAULT_INDUSTRY_LABEL["label"],
                "industry_color": item.get("industry_color") or DEFAULT_INDUSTRY_LABEL["color"],
                "resume_ids": set(),
                "company_names": set(),
                "project_count": 0,
                "work_count": 0,
            }

        bucket = summary[key]
        if item.get("resume_id"):
            bucket["resume_ids"].add(item["resume_id"])
        if item.get("_summary_source") == "project":
            bucket["project_count"] += 1
        if item.get("_summary_source") == "work":
            bucket["work_count"] += 1
            company = str(item.get("company") or "").strip()
            if company:
                bucket["company_names"].add(company)

    rows = []
    for bucket in summary.values():
        rows.append(
            {
                "industry_key": bucket["industry_key"],
                "industry_label": bucket["industry_label"],
                "industry_color": bucket["industry_color"],
                "resume_count": len(bucket["resume_ids"]),
                "project_count": bucket["project_count"],
                "work_count": bucket["work_count"],
                "company_count": len(bucket["company_names"]),
            }
        )

    rows.sort(key=lambda item: (item["resume_count"], item["project_count"], item["work_count"]), reverse=True)
    return rows


def summarize_resume_experiences(db: Session, limit: int = 500) -> Dict[str, Any]:
    safe_limit = max(1, min(int(limit or 500), 1000))
    resumes = (
        db.query(Resume)
        .filter(Resume.parsed_data.isnot(None))
        .order_by(Resume.created_at.desc(), Resume.id.desc())
        .limit(safe_limit)
        .all()
    )

    work_experiences: List[Dict[str, Any]] = []
    project_experiences: List[Dict[str, Any]] = []
    logic_analyses: List[Dict[str, Any]] = []
    summary_items: List[Dict[str, Any]] = []

    for resume in resumes:
        parsed_data = resume.parsed_data or {}
        resume_industry = _industry_context_for_resume(resume)
        for item in _as_list(parsed_data.get("work_experiences")):
            with_context = _attach_resume_context(item, resume)
            if with_context:
                industry = _structured_industry_for_item(with_context) or _match_industry_label(
                    _text_blob(with_context, parsed_data.get("logic_analysis"), resume_industry["label"])
                )
                with_context = _with_industry_fields(with_context, industry)
                work_experiences.append(with_context)
                summary_items.append({**with_context, "_summary_source": "work"})

        for item in _as_list(parsed_data.get("project_experiences")):
            with_context = _attach_resume_context(item, resume)
            if with_context:
                industry = _structured_industry_for_item(with_context) or _match_industry_label(
                    _text_blob(
                        with_context,
                        parsed_data.get("logic_analysis"),
                        parsed_data.get("startup_landing_ideas"),
                        resume_industry["label"],
                    )
                )
                with_context = _with_industry_fields(with_context, industry)
                project_experiences.append(with_context)
                summary_items.append({**with_context, "_summary_source": "project"})

        if parsed_data.get("logic_analysis"):
            logic_analyses.append(
                _with_industry_fields(
                    {
                        "resume_id": str(resume.id),
                        "candidate_name": resume.candidate_name,
                        "analysis": parsed_data["logic_analysis"],
                    },
                    resume_industry,
                )
            )

    return {
        "resume_count": len(resumes),
        "work_experiences": work_experiences,
        "project_experiences": project_experiences,
        "logic_analyses": logic_analyses,
        "industry_summary": _industry_summary_from_items(summary_items),
    }


def _project_has_missing_business_evidence(project: Dict[str, Any]) -> bool:
    missing_evidence = _as_list(project.get("missing_evidence"))
    business_model = str(project.get("business_model") or "").strip()
    return bool(missing_evidence) or not business_model


INDUSTRY_PROFILES = [
    {
        "key": "software_ai_delivery",
        "name": "软件/AI/系统交付",
        "strong_keywords": ["软件外包", "系统集成", "AI交付", "AI Agent", "大模型", "数据中台", "知识库", "SaaS", "低代码"],
        "keywords": ["外包", "系统", "平台", "Agent", "AI", "开发", "软件", "交付", "产品化"],
        "solution_focus": ["需求到交付闭环", "AI工具化提效", "数据中台/知识库", "项目制转标准产品"],
        "offer_template": "把候选人做系统平台、AI Agent、数据运营和项目交付的经验，沉淀为软件与AI交付企业的标准化交付、提效工具和行业解决方案。",
    },
    {
        "key": "engineering",
        "name": "工程建设/运维/成本管控",
        "strong_keywords": ["工程造价", "工程结算", "工程审计", "施工管理", "竣工结算", "物业维保", "项目成本"],
        "keywords": ["工程", "造价", "结算", "维保", "地产", "物业", "施工", "制造", "成本", "巡检"],
        "solution_focus": ["流程标准化", "数据资产治理", "成本审计与风险预警", "AI辅助工单/报表/巡检"],
        "offer_template": "把候选人过往的工程结算、维保运营和流程治理经验，包装为工程企业的项目成本管控、维保效率提升和数据看板方案。",
    },
    {
        "key": "hr_enterprise",
        "name": "人力资源/企业管理",
        "strong_keywords": ["人力资源", "企业管理", "人事系统", "绩效管理", "组织管理", "薪酬绩效"],
        "keywords": ["人事", "HR", "绩效", "OA", "审批", "组织", "员工", "招聘", "考勤", "薪酬"],
        "solution_focus": ["人事流程数字化", "绩效口径治理", "审批协同", "组织数据看板"],
        "offer_template": "复用候选人的人事系统、OA审批和绩效治理经验，为企业管理客户设计流程梳理、系统落地和管理数据化方案。",
    },
    {
        "key": "finance",
        "name": "金融服务/信贷/风控",
        "strong_keywords": ["金融服务", "银行服务", "信贷", "风控", "贷款审批", "授信", "保险"],
        "keywords": ["金融", "银行", "农信", "支付", "贷款", "合规", "渠道", "转化"],
        "solution_focus": ["金融产品流程优化", "风控合规", "渠道拓展", "客户转化与留存"],
        "offer_template": "将候选人的信贷、银行APP、风控合规和渠道经验，复用为金融机构的产品流程优化、风险控制和获客转化方案。",
    },
    {
        "key": "education",
        "name": "教育培训/院校数字化",
        "strong_keywords": ["院校数字化", "教学评估", "就业服务", "岗位推荐", "课程体系", "双高建设"],
        "keywords": ["教育", "院校", "学生", "教学", "课程", "就业", "培训", "学校"],
        "solution_focus": ["教学数据分析", "就业岗位匹配", "AIGC报告", "院校服务SaaS化"],
        "offer_template": "复用候选人在教学评估、岗位推荐和AIGC报告生成上的经验，为院校客户提供教学数据化和就业服务方案。",
    },
    {
        "key": "retail_ecommerce",
        "name": "零售电商/本地生活",
        "strong_keywords": ["本地生活", "私域增长", "会员运营", "商户运营", "门店营销", "电商平台"],
        "keywords": ["零售", "电商", "商户", "会员", "GMV", "私域", "门店", "营销", "社交"],
        "solution_focus": ["会员增长", "商户运营", "数据化营销", "交易转化与留存"],
        "offer_template": "将候选人的电商、私域增长和零售数据经验，转化为商户运营、会员增长和本地生活平台方案。",
    },
]


def _text_blob(*values: Any) -> str:
    parts: List[str] = []
    for value in values:
        if isinstance(value, list):
            parts.extend(str(item) for item in value)
        elif isinstance(value, dict):
            parts.extend(str(item) for item in value.values())
        elif value is not None:
            parts.append(str(value))
    return " ".join(parts)


def _match_industry(text: str) -> Dict[str, Any]:
    lowered = (text or "").lower()
    scored = []
    for profile in INDUSTRY_PROFILES:
        score = sum(3 for keyword in profile.get("strong_keywords", []) if keyword.lower() in lowered)
        score += sum(1 for keyword in profile["keywords"] if keyword.lower() in lowered)
        if score:
            scored.append((score, profile))
    if not scored:
        return {
            "key": "general",
            "name": "通用企业数字化/商业优化",
            "keywords": [],
            "solution_focus": ["需求梳理", "流程优化", "数据看板", "商业模式补全"],
            "offer_template": "把候选人的项目管理、需求分析和业务落地经验，整理为通用企业的流程优化、数据化运营和商业闭环方案。",
        }
    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1]


def summarize_industry_solution_agent(db: Session, limit: int = 500) -> Dict[str, Any]:
    safe_limit = max(1, min(int(limit or 500), 1000))
    resumes = (
        db.query(Resume)
        .filter(Resume.parsed_data.isnot(None))
        .order_by(Resume.created_at.desc())
        .limit(safe_limit)
        .all()
    )

    industry_map: Dict[str, Dict[str, Any]] = {}

    def ensure_bucket(profile: Dict[str, Any]) -> Dict[str, Any]:
        key = profile["key"]
        if key not in industry_map:
            industry_map[key] = {
                "key": key,
                "name": profile["name"],
                "solution_focus": profile["solution_focus"],
                "offer_template": profile["offer_template"],
                "project_cases": [],
                "work_cases": [],
                "candidate_pool": {},
                "reusable_patterns": [],
            }
        return industry_map[key]

    for resume in resumes:
        parsed_data = resume.parsed_data or {}
        landing_ideas = _as_list(parsed_data.get("startup_landing_ideas"))
        logic_analysis = parsed_data.get("logic_analysis")

        for project in _as_list(parsed_data.get("project_experiences")):
            if not isinstance(project, dict):
                continue
            profile = _match_industry(_text_blob(project, landing_ideas, logic_analysis, resume.candidate_name))
            bucket = ensure_bucket(profile)
            bucket["project_cases"].append(
                {
                    "resume_id": str(resume.id),
                    "candidate_name": resume.candidate_name,
                    "project_name": project.get("name") or "未命名项目",
                    "role": project.get("role"),
                    "problem": project.get("problem"),
                    "solution": project.get("solution"),
                    "business_model": project.get("business_model"),
                    "missing_evidence": _as_list(project.get("missing_evidence")),
                    "landing_ideas": landing_ideas,
                }
            )
            candidate = bucket["candidate_pool"].setdefault(
                str(resume.id),
                {
                    "resume_id": str(resume.id),
                    "candidate_name": resume.candidate_name,
                    "logic_analysis": logic_analysis,
                    "case_count": 0,
                },
            )
            candidate["case_count"] += 1

        for work in _as_list(parsed_data.get("work_experiences")):
            if not isinstance(work, dict):
                continue
            profile = _match_industry(_text_blob(work, logic_analysis, resume.candidate_name))
            bucket = ensure_bucket(profile)
            bucket["work_cases"].append(
                {
                    "resume_id": str(resume.id),
                    "candidate_name": resume.candidate_name,
                    "company": work.get("company") or "未命名公司",
                    "role": work.get("role"),
                    "summary": work.get("summary"),
                    "capabilities": _as_list(work.get("capabilities")),
                }
            )
            candidate = bucket["candidate_pool"].setdefault(
                str(resume.id),
                {
                    "resume_id": str(resume.id),
                    "candidate_name": resume.candidate_name,
                    "logic_analysis": logic_analysis,
                    "case_count": 0,
                },
            )
            candidate["case_count"] += 1

    industries = []
    for bucket in industry_map.values():
        candidates = sorted(bucket["candidate_pool"].values(), key=lambda item: item["case_count"], reverse=True)
        patterns = []
        if bucket["project_cases"]:
            patterns.append(f"可复用 {len(bucket['project_cases'])} 个项目案例做行业方案背书")
        if bucket["work_cases"]:
            patterns.append(f"可调用 {len(bucket['work_cases'])} 段工作经历支撑交付能力")
        if candidates:
            patterns.append("核心候选人：" + "、".join(item["candidate_name"] or "未识别" for item in candidates[:5]))
        bucket["candidate_pool"] = candidates[:12]
        bucket["reusable_patterns"] = patterns
        bucket["project_count"] = len(bucket["project_cases"])
        bucket["work_count"] = len(bucket["work_cases"])
        bucket["candidate_count"] = len(candidates)
        bucket["project_cases"] = bucket["project_cases"][:12]
        bucket["work_cases"] = bucket["work_cases"][:12]
        industries.append(bucket)

    industries.sort(key=lambda item: (item["project_count"] + item["work_count"], item["candidate_count"]), reverse=True)
    return {
        "resume_count": len(resumes),
        "industry_count": len(industries),
        "industries": industries,
    }


def _string_list(values: Any) -> List[str]:
    return [str(item).strip() for item in _as_list(values) if str(item).strip()]


def _request_text_blob(request_data: Dict[str, Any]) -> str:
    conversation = request_data.get("conversation") or []
    conversation_text = " ".join(
        str(item.get("content") or "")
        for item in conversation
        if isinstance(item, dict)
    )
    return _text_blob(
        request_data.get("industry"),
        request_data.get("business_type"),
        request_data.get("current_process"),
        request_data.get("pain_points"),
        request_data.get("goals"),
        conversation_text,
    )


def _industry_profile_from_request(request_data: Dict[str, Any]) -> Dict[str, Any]:
    explicit_industry = str(request_data.get("industry") or "").strip().lower()
    if explicit_industry:
        for profile in INDUSTRY_PROFILES:
            names = [
                profile.get("key"),
                profile.get("name"),
                *profile.get("strong_keywords", []),
                *profile.get("keywords", []),
            ]
            if any(
                explicit_industry in str(name or "").lower()
                or str(name or "").lower() in explicit_industry
                for name in names
                if str(name or "").strip()
            ):
                return profile
    return _match_industry(_request_text_blob(request_data))


def _build_solution_agent_context(db: Session, request_data: Dict[str, Any]) -> Dict[str, Any]:
    safe_limit = max(1, min(int(request_data.get("limit") or 500), 1000))
    requested_industry = _industry_profile_from_request(request_data)

    resumes = (
        db.query(Resume)
        .filter(Resume.parsed_data.isnot(None))
        .order_by(Resume.created_at.desc(), Resume.id.desc())
        .limit(safe_limit)
        .all()
    )

    project_cases: List[Dict[str, Any]] = []
    work_cases: List[Dict[str, Any]] = []
    candidate_pool: Dict[str, Dict[str, Any]] = {}

    for resume in resumes:
        parsed_data = resume.parsed_data or {}
        logic_analysis = parsed_data.get("logic_analysis")
        landing_ideas = _as_list(parsed_data.get("startup_landing_ideas"))

        for project in _as_list(parsed_data.get("project_experiences")):
            if not isinstance(project, dict):
                continue
            project_profile = _match_industry(_text_blob(project, landing_ideas, logic_analysis, resume.candidate_name))
            if requested_industry["key"] != "general" and project_profile["key"] != requested_industry["key"]:
                continue
            project_cases.append(
                {
                    "resume_id": str(resume.id),
                    "candidate_name": resume.candidate_name,
                    "project_name": project.get("name") or "未命名项目",
                    "role": project.get("role"),
                    "problem": project.get("problem"),
                    "solution": project.get("solution"),
                    "business_model": project.get("business_model"),
                    "metrics": _as_list(project.get("metrics")),
                    "missing_evidence": _as_list(project.get("missing_evidence")),
                    "landing_ideas": landing_ideas,
                }
            )
            candidate = candidate_pool.setdefault(
                str(resume.id),
                {
                    "resume_id": str(resume.id),
                    "candidate_name": resume.candidate_name,
                    "logic_analysis": logic_analysis,
                    "capabilities": set(),
                    "case_count": 0,
                },
            )
            candidate["case_count"] += 1

        for work in _as_list(parsed_data.get("work_experiences")):
            if not isinstance(work, dict):
                continue
            work_profile = _match_industry(_text_blob(work, logic_analysis, resume.candidate_name))
            if requested_industry["key"] != "general" and work_profile["key"] != requested_industry["key"]:
                continue
            capabilities = _string_list(work.get("capabilities"))
            work_cases.append(
                {
                    "resume_id": str(resume.id),
                    "candidate_name": resume.candidate_name,
                    "company": work.get("company") or "未命名公司",
                    "role": work.get("role"),
                    "summary": work.get("summary"),
                    "capabilities": capabilities,
                }
            )
            candidate = candidate_pool.setdefault(
                str(resume.id),
                {
                    "resume_id": str(resume.id),
                    "candidate_name": resume.candidate_name,
                    "logic_analysis": logic_analysis,
                    "capabilities": set(),
                    "case_count": 0,
                },
            )
            candidate["case_count"] += 1
            candidate["capabilities"].update(capabilities)

    candidates = []
    for item in candidate_pool.values():
        candidates.append(
            {
                **item,
                "capabilities": sorted(item["capabilities"])[:8],
            }
        )
    candidates.sort(key=lambda item: item["case_count"], reverse=True)

    return {
        "industry": requested_industry["name"],
        "industry_key": requested_industry["key"],
        "solution_focus": requested_industry.get("solution_focus", []),
        "offer_template": requested_industry.get("offer_template", ""),
        "project_cases": project_cases[:16],
        "work_cases": work_cases[:16],
        "candidate_pool": candidates[:12],
    }


def _fallback_solution_response(request_data: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    business_type = str(request_data.get("business_type") or request_data.get("industry") or context.get("industry") or "当前业务").strip()
    pain_points = _string_list(request_data.get("pain_points"))
    goals = _string_list(request_data.get("goals"))
    project_cases = context.get("project_cases") or []
    work_cases = context.get("work_cases") or []
    capabilities = []
    for work in work_cases:
        capabilities.extend(_string_list(work.get("capabilities")))
    capabilities = list(dict.fromkeys(capabilities))[:8]

    if not capabilities:
        capabilities = _string_list(context.get("solution_focus"))[:6]

    seeds = goals or [case.get("solution") or case.get("project_name") for case in project_cases[:3]]
    if not seeds:
        seeds = [f"{business_type}流程优化平台"]

    recommended = []
    for index, seed in enumerate(seeds[:3], start=1):
        related = [
            case.get("project_name")
            for case in project_cases[:4]
            if case.get("project_name")
        ][:3]
        recommended.append(
            {
                "name": str(seed).strip() or f"{business_type}方案 {index}",
                "scenario": request_data.get("current_process") or "围绕现有业务流程做数字化和AI能力增强。",
                "value": "减少人工整理与重复判断，把已有项目经验沉淀为可复用的系统能力。",
                "related_cases": related,
                "implementation_steps": [
                    "梳理现有流程和关键数据来源",
                    "选择一个高频痛点做最小可用版本",
                    "接入人才库中的项目经验和业务规则",
                    "用试点数据验证效率、准确率和交付成本",
                ],
            }
        )

    return {
        "title": f"{business_type}智能方案草案",
        "summary": context.get("offer_template") or "基于当前人才库、项目库和公司经历，形成可落地的业务优化方案。",
        "recommended_solutions": recommended,
        "needed_capabilities": capabilities,
        "risks": [
            "现有流程和数据口径需要进一步确认",
            "方案价值需要通过真实项目数据验证",
        ],
        "next_questions": [
            "当前业务流程里最耗人力的一步是什么？",
            "哪些数据已经结构化沉淀，哪些还在文档或表格里？",
            "希望先做内部提效工具，还是面向客户销售的产品？",
        ] if not pain_points else [
            f"针对“{pain_points[0]}”，现在有没有可量化的成本、时长或错误率？",
            "第一期希望覆盖哪些角色和使用场景？",
            "是否已有可接入的历史项目资料或客户案例？",
        ],
    }


def generate_industry_solution_from_agent(db: Session, request_data: Dict[str, Any]) -> Dict[str, Any]:
    context = _build_solution_agent_context(db, request_data)
    payload = {
        "user_profile": {
            "industry": request_data.get("industry"),
            "business_type": request_data.get("business_type"),
            "current_process": request_data.get("current_process"),
            "pain_points": _string_list(request_data.get("pain_points")),
            "goals": _string_list(request_data.get("goals")),
            "conversation": request_data.get("conversation") or [],
        },
        **context,
    }

    generated = generate_solution_agent_response(payload)
    if not generated:
        generated = _fallback_solution_response(request_data, context)

    return {
        "title": generated.get("title") or "行业智能体方案草案",
        "summary": generated.get("summary") or "",
        "recommended_solutions": _as_list(generated.get("recommended_solutions")),
        "needed_capabilities": _string_list(generated.get("needed_capabilities")),
        "risks": _string_list(generated.get("risks")),
        "next_questions": _string_list(generated.get("next_questions")),
        "knowledge_context": {
            "industry": context["industry"],
            "industry_key": context["industry_key"],
            "project_count": len(context["project_cases"]),
            "work_count": len(context["work_cases"]),
            "candidate_count": len(context["candidate_pool"]),
            "project_cases": context["project_cases"][:6],
            "work_cases": context["work_cases"][:6],
            "candidate_pool": context["candidate_pool"][:6],
        },
    }


def summarize_resume_projects(
    db: Session,
    limit: int = 500,
    missing_only: bool = False,
    candidate_name: str = None,
) -> Dict[str, Any]:
    safe_limit = max(1, min(int(limit or 500), 1000))
    query = (
        db.query(Resume)
        .filter(Resume.parsed_data.isnot(None))
        .order_by(Resume.created_at.desc(), Resume.id.desc())
    )
    if candidate_name:
        query = query.filter(Resume.candidate_name.ilike(f"%{candidate_name}%"))

    projects: List[Dict[str, Any]] = []
    summary_items: List[Dict[str, Any]] = []
    for resume in query.limit(safe_limit).all():
        parsed_data = resume.parsed_data or {}
        landing_ideas = _as_list(parsed_data.get("startup_landing_ideas"))
        for project in _as_list(parsed_data.get("project_experiences")):
            if not isinstance(project, dict):
                continue
            if missing_only and not _project_has_missing_business_evidence(project):
                continue
            industry = _structured_industry_for_item(project) or _match_industry_label(
                _text_blob(
                    project,
                    landing_ideas,
                    parsed_data.get("logic_analysis"),
                    resume.candidate_name,
                )
            )
            project_item = _with_industry_fields(
                {
                    **project,
                    "resume_id": str(resume.id),
                    "candidate_name": resume.candidate_name,
                    "resume_score": resume.match_score,
                    "logic_analysis": parsed_data.get("logic_analysis"),
                    "landing_ideas": landing_ideas,
                    "created_at": resume.created_at.isoformat() if resume.created_at else None,
                },
                industry,
            )
            projects.append(project_item)
            summary_items.append({**project_item, "_summary_source": "project"})

    return {
        "resume_count": len({item["resume_id"] for item in projects}),
        "project_count": len(projects),
        "projects": projects,
        "industry_summary": _industry_summary_from_items(summary_items),
    }


def get_resumes(db: Session, skip: int = 0, limit: int = 100, candidate_name: str = None, status: str = None, position_id: UUID = None, reviewer_id: UUID = None):
    query = db.query(Resume).options(joinedload(Resume.position))

    if candidate_name:
        query = query.filter(Resume.candidate_name.ilike(f"%{candidate_name}%"))

    if status:
        query = query.filter(Resume.status == status)

    if position_id:
        query = query.filter(Resume.position_id == position_id)

    if reviewer_id:
        query = query.join(DepartmentReview, Resume.id == DepartmentReview.resume_id)
        query = query.filter(DepartmentReview.reviewer_id == reviewer_id)
        query = query.filter(DepartmentReview.is_completed == False)

    query = query.order_by(Resume.created_at.desc())

    return query.offset(skip).limit(limit).all()

def get_resume(db: Session, resume_id: UUID):
    return db.query(Resume).options(joinedload(Resume.position)).filter(Resume.id == resume_id).first()


CHINA_TIMEZONE = timezone(timedelta(hours=8))


def _format_datetime_cn(dt: Optional[datetime]) -> str:
    if not dt:
        return "N/A"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(CHINA_TIMEZONE).strftime("%Y-%m-%d %H:%M")


def _enum_text(value: Any, mapping: Optional[Dict[str, str]] = None) -> str:
    if value is None:
        return "N/A"
    raw_value = value.value if hasattr(value, "value") else str(value)
    return (mapping or {}).get(raw_value, raw_value)


def _text(value: Any, fallback: str = "N/A") -> str:
    if value is None:
        return fallback
    value = str(value).strip()
    return value or fallback


def _append_question_section(lines: List[str], title: str, questions: List[Any]) -> None:
    if not questions:
        return
    lines.extend([f"### {title}", ""])
    for index, item in enumerate(questions, start=1):
        if isinstance(item, dict):
            question = item.get("question") or item.get("title") or f"问题 {index}"
            lines.append(f"{index}. {_text(question, f'问题 {index}')}")
            detail_parts = [
                ("目的", item.get("purpose")),
                ("关联经历", item.get("target_experience")),
                ("关联项目", item.get("target_project")),
                ("缺失信息", item.get("missing_context")),
            ]
            for label, detail in detail_parts:
                if detail:
                    lines.append(f"   - {label}: {detail}")
        elif item:
            lines.append(f"{index}. {item}")
    lines.append("")


def export_resume_analysis_report(db: Session, resume_id: UUID, format: str = "markdown") -> Optional[str]:
    resume = db.query(Resume).options(joinedload(Resume.position)).filter(Resume.id == resume_id).first()
    if not resume:
        return None

    parsed_data = resume.parsed_data or {}
    position_title = resume.position.title if resume.position else "N/A"
    screening_result_map = {
        "pending": "待定",
        "passed": "通过",
        "rejected": "淘汰",
        "waitlist": "待定",
    }
    status_map = {
        "pending_screening": "待初筛",
        "pending_review": "待评审",
        "pending_dept_review": "待部门评审",
        "pending_hr_decision": "待 HR 决策",
        "auto_rejected_pending_review": "AI 建议淘汰待确认",
        "pending_interview": "待面试",
        "interview_passed": "面试通过",
        "interview_failed": "面试未通过",
        "offer_pending": "Offer 待确认",
        "offer_accepted": "Offer 已接受",
        "offer_rejected": "Offer 已拒绝",
        "onboarding": "入职中",
        "completed": "已完成",
        "rejected": "已淘汰",
        "waitlist": "备选",
    }

    lines = [
        "# 简历分析报告",
        "",
        "## 基本信息",
        "",
        f"- **候选人**: {_text(resume.candidate_name, '未识别')}",
        f"- **应聘岗位**: {position_title}",
        f"- **联系方式**: {_text(resume.contact)}",
        f"- **邮箱**: {_text(resume.email)}",
        f"- **分析状态**: {_text(resume.parse_status)}",
        f"- **流程状态**: {_enum_text(resume.status, status_map)}",
        f"- **初筛结果**: {_enum_text(resume.screening_result, screening_result_map)}",
        f"- **匹配度评分**: {resume.match_score if resume.match_score is not None else 'N/A'} 分",
        f"- **分析完成时间**: {_format_datetime_cn(resume.parsed_at)}",
        "",
        "## AI 综合分析",
        "",
        resume.ai_review or "暂无分析结果",
        "",
        "## 结构化画像",
        "",
        f"- **工作年限**: {_text(parsed_data.get('years_of_experience'))}",
        f"- **最近公司**: {_text(parsed_data.get('recent_company'))}",
        f"- **最高学历**: {_text(parsed_data.get('highest_degree'))}",
        f"- **毕业学校**: {_text(parsed_data.get('school'))}",
    ]

    if parsed_data.get("experience_summary"):
        lines.extend(["", "### 经历概要", "", str(parsed_data["experience_summary"])])

    project_evaluation = parsed_data.get("project_evaluation")
    if isinstance(project_evaluation, dict) and project_evaluation.get("summary"):
        score = project_evaluation.get("score")
        score_text = f"（评分: {score}）" if score is not None else ""
        lines.extend(["", "### 项目评估", "", f"{project_evaluation['summary']}{score_text}"])

    if parsed_data.get("logic_analysis"):
        lines.extend(["", "### 底层逻辑分析", "", str(parsed_data["logic_analysis"])])

    work_experiences = _as_list(parsed_data.get("work_experiences"))
    lines.extend(["", "## 工作经历", ""])
    if work_experiences:
        for index, item in enumerate(work_experiences, start=1):
            if not isinstance(item, dict):
                continue
            lines.append(f"### {index}. {_text(item.get('company'), '未命名公司')}")
            lines.append(f"- **角色**: {_text(item.get('role'))}")
            lines.append(f"- **时间**: {_text(item.get('period'))}")
            lines.append(f"- **概要**: {_text(item.get('summary'))}")
            capabilities = [str(capability) for capability in _as_list(item.get("capabilities")) if capability]
            if capabilities:
                lines.append(f"- **能力标签**: {', '.join(capabilities)}")
            lines.append("")
    else:
        lines.extend(["暂无工作经历", ""])

    project_experiences = _as_list(parsed_data.get("project_experiences"))
    lines.extend(["## 项目经历与商业模式", ""])
    if project_experiences:
        for index, item in enumerate(project_experiences, start=1):
            if not isinstance(item, dict):
                continue
            lines.append(f"### {index}. {_text(item.get('name'), '未命名项目')}")
            lines.append(f"- **角色**: {_text(item.get('role'))}")
            lines.append(f"- **问题**: {_text(item.get('problem'))}")
            lines.append(f"- **方案**: {_text(item.get('solution'))}")
            if item.get("business_model"):
                lines.append(f"- **商业模式**: {item['business_model']}")
            missing_evidence = [str(evidence) for evidence in _as_list(item.get("missing_evidence")) if evidence]
            if missing_evidence:
                lines.append(f"- **待补充证据**: {', '.join(missing_evidence)}")
            lines.append("")
    else:
        lines.extend(["暂无项目经历", ""])

    lines.extend(["## 面试追问建议", ""])
    before_question_count = len(lines)
    _append_question_section(lines, "针对经历的面试追问", _as_list(parsed_data.get("interview_questions")))
    _append_question_section(lines, "商业模式解释问题", _as_list(parsed_data.get("business_model_questions")))
    _append_question_section(lines, "经历补全问题", _as_list(parsed_data.get("experience_completion_questions")))
    if len(lines) == before_question_count:
        lines.extend(["暂无追问建议", ""])

    return "\n".join(lines).strip() + "\n"

def update_resume(db: Session, resume_id: UUID, resume: ResumeUpdate):
    db_resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not db_resume:
        return None
    
    update_data = resume.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_resume, key, value)
    
    db.commit()
    db.refresh(db_resume)
    return db_resume

def delete_resume(db: Session, resume_id: UUID):
    db_resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not db_resume:
        return None

    coding_test_ids = [
        test_id
        for (test_id,) in db.query(CodingTest.id).filter(CodingTest.resume_id == resume_id).all()
    ]
    if coding_test_ids:
        db.query(CodingSubmission).filter(
            CodingSubmission.coding_test_id.in_(coding_test_ids)
        ).delete(synchronize_session=False)
        db.query(CodingTest).filter(CodingTest.id.in_(coding_test_ids)).delete(synchronize_session=False)

    # Get interview IDs for this resume
    interview_ids = [i.id for i in db.query(Interview).filter(Interview.resume_id == resume_id).all()]

    # Delete associated interview panels first (due to foreign key constraint)
    if interview_ids:
        db.query(InterviewPanel).filter(InterviewPanel.interview_id.in_(interview_ids)).delete(synchronize_session=False)

    # Delete associated interviews
    db.query(Interview).filter(Interview.resume_id == resume_id).delete(synchronize_session=False)

    # Delete associated department reviews
    db.query(DepartmentReview).filter(DepartmentReview.resume_id == resume_id).delete(synchronize_session=False)

    # Delete associated offers
    db.query(Offer).filter(Offer.resume_id == resume_id).delete(synchronize_session=False)

    db.query(ResumeMailImport).filter(ResumeMailImport.resume_id == resume_id).update(
        {"resume_id": None},
        synchronize_session=False,
    )

    # Solution: Eager load position before deletion, so it's in memory.
    # Re-query with options
    db_resume = db.query(Resume).options(joinedload(Resume.position)).filter(Resume.id == resume_id).first()

    db.delete(db_resume)
    db.commit()
    return db_resume


# ==================== 简历查重 ====================

def check_duplicate_resume(db: Session, email: Optional[str], contact: Optional[str], position_id: Optional[UUID] = None) -> Optional[Resume]:
    """
    检查同一岗位下是否存在相同邮箱或手机号的简历
    返回已存在的简历或 None
    """
    conditions = []

    if email:
        conditions.append(Resume.email == email.strip().lower())

    if contact:
        conditions.append(Resume.contact == contact.strip())

    if not conditions:
        return None

    query = db.query(Resume).filter(or_(*conditions))
    if position_id:
        query = query.filter(Resume.position_id == position_id)

    existing = query.first()

    return existing


# ==================== 部门评审 ====================

def create_department_review(db: Session, resume_id: UUID, reviewer_id: UUID) -> DepartmentReview:
    """
    创建部门评审记录（指派评审人）
    """
    # 检查简历是否存在
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在")

    # 检查是否已经指派过该评审人
    existing = db.query(DepartmentReview).filter(
        DepartmentReview.resume_id == resume_id,
        DepartmentReview.reviewer_id == reviewer_id
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="该评审人已被指派")

    # 创建评审记录
    review = DepartmentReview(
        resume_id=resume_id,
        reviewer_id=reviewer_id,
        is_completed=False
        # 不设置 recommendation 默认值，让它为 None
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    # 更新简历状态为待部门评审
    if resume.status == ResumeStatus.PENDING_REVIEW:
        # 首次指派评审人时，更新状态
        resume.status = ResumeStatus.PENDING_DEPT_REVIEW
        db.commit()

    return review


def get_department_reviews(db: Session, resume_id: UUID) -> List[DepartmentReview]:
    """
    获取简历的所有部门评审记录
    """
    reviews = db.query(DepartmentReview).options(
        joinedload(DepartmentReview.reviewer)
    ).filter(DepartmentReview.resume_id == resume_id).all()
    return reviews


def complete_department_review(db: Session, review_id: UUID, reviewer_id: UUID, review_data: DepartmentReviewUpdate) -> DepartmentReview:
    """
    完成部门评审
    """
    review = db.query(DepartmentReview).filter(
        DepartmentReview.id == review_id,
        DepartmentReview.reviewer_id == reviewer_id
    ).first()

    if not review:
        raise HTTPException(status_code=404, detail="评审记录不存在")

    if review.is_completed:
        raise HTTPException(status_code=400, detail="该评审已完成，不可修改")

    # 更新评审数据
    update_data = review_data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(review, key, value)

    review.is_completed = True
    review.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(review)

    # 检查是否所有评审人都已完成
    _check_and_update_resume_status(db, review.resume_id)

    return review


def _check_and_update_resume_status(db: Session, resume_id: UUID):
    """
    检查所有评审人是否已完成，如果是则更新简历状态并发送HR通知邮件
    """
    reviews = db.query(DepartmentReview).filter(
        DepartmentReview.resume_id == resume_id
    ).all()

    if not reviews:
        return

    all_completed = all(r.is_completed for r in reviews)

    if all_completed:
        resume = db.query(Resume).filter(Resume.id == resume_id).first()
        if resume:
            resume.status = ResumeStatus.PENDING_HR_DECISION
            db.commit()
            
            _send_hr_review_notification(db, resume, reviews)


def _send_hr_review_notification(db: Session, resume: Resume, reviews: List[DepartmentReview]):
    """
    发送HR审核通知邮件
    """
    try:
        from app.services.mail_service import MailService
        from app.models.models import SystemConfig
        
        hr_users = db.query(User).filter(
            User.role == UserRole.HR,
            User.is_active == True
        ).all()
        
        if not hr_users:
            return
        
        mail_service = MailService(db)
        if not mail_service.config.is_valid():
            return
        
        system_config = db.query(SystemConfig).first()
        frontend_url = system_config.frontend_url if system_config else "http://localhost:5173"
        
        recommend_count = sum(1 for r in reviews if r.recommendation == ReviewRecommendation.RECOMMEND)
        not_recommend_count = sum(1 for r in reviews if r.recommendation == ReviewRecommendation.NOT_RECOMMEND)
        
        overall_scores = [r.overall_score for r in reviews if r.overall_score is not None]
        avg_score = sum(overall_scores) / len(overall_scores) if overall_scores else 0
        
        for hr in hr_users:
            if not hr.email:
                continue
                
            review_url = f"{frontend_url}/resumes/{resume.id}"
            
            subject = f"【HR审核通知】部门评审完成 - {resume.candidate_name}"
            
            html_content = f"""
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #1890ff;">HR 审核通知</h2>
                    <p>尊敬的 {hr.full_name or 'HR'}，</p>
                    <p>候选人 <strong>{resume.candidate_name}</strong> 的部门评审已完成，请进行最终审核：</p>
                    
                    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p><strong>经历评估分：</strong>{resume.match_score}分</p>
                        <p><strong>部门评审结果：</strong></p>
                        <ul>
                            <li>推荐：{recommend_count}人</li>
                            <li>不推荐：{not_recommend_count}人</li>
                            <li>平均综合评分：{avg_score:.1f}分</li>
                        </ul>
                    </div>
                    
                    <p>请点击下方链接查看详情并进行最终决策：</p>
                    <p style="text-align: center; margin: 30px 0;">
                        <a href="{review_url}" style="background-color: #52c41a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">立即审核</a>
                    </p>
                    
                    <p style="color: #999; font-size: 12px;">此邮件由系统自动发送，请勿直接回复。</p>
                </div>
            </body>
            </html>
            """
            
            mail_service._send_email(hr.email, subject, html_content)
            
    except Exception as e:
        import logging
        logging.error(f"Failed to send HR review notification: {e}")


def aggregate_department_reviews(db: Session, resume_id: UUID) -> Dict[str, Any]:
    """
    聚合多人评审结果
    """
    reviews = get_department_reviews(db, resume_id)

    if not reviews:
        return {
            "resume_id": resume_id,
            "total_reviewers": 0,
            "completed_reviewers": 0,
            "avg_technical_score": None,
            "avg_experience_score": None,
            "avg_overall_score": None,
            "recommend_count": 0,
            "not_recommend_count": 0,
            "pending_count": 0,
            "recommend_ratio": 0.0,
            "comments": [],
            "reviews": []
        }

    completed_reviews = [r for r in reviews if r.is_completed]

    # 计算平均分
    technical_scores = [r.technical_score for r in completed_reviews if r.technical_score is not None]
    experience_scores = [r.experience_score for r in completed_reviews if r.experience_score is not None]
    overall_scores = [r.overall_score for r in completed_reviews if r.overall_score is not None]

    # 统计推荐情况
    recommend_count = sum(1 for r in completed_reviews if r.recommendation == ReviewRecommendation.RECOMMEND)
    not_recommend_count = sum(1 for r in completed_reviews if r.recommendation == ReviewRecommendation.NOT_RECOMMEND)
    pending_count = sum(1 for r in completed_reviews if r.recommendation == ReviewRecommendation.PENDING)

    # 汇总评语
    comments = [r.comment for r in completed_reviews if r.comment]

    total_completed = len(completed_reviews)
    recommend_ratio = recommend_count / total_completed if total_completed > 0 else 0.0

    # 构建响应
    review_responses = []
    for r in reviews:
        reviewer_name = r.reviewer.full_name if r.reviewer else None
        review_responses.append({
            "id": r.id,
            "resume_id": r.resume_id,
            "reviewer_id": r.reviewer_id,
            "technical_score": r.technical_score,
            "experience_score": r.experience_score,
            "overall_score": r.overall_score,
            "recommendation": r.recommendation,
            "comment": r.comment,
            "is_completed": r.is_completed,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
            "reviewer_name": reviewer_name
        })

    return {
        "resume_id": resume_id,
        "total_reviewers": len(reviews),
        "completed_reviewers": len(completed_reviews),
        "avg_technical_score": sum(technical_scores) / len(technical_scores) if technical_scores else None,
        "avg_experience_score": sum(experience_scores) / len(experience_scores) if experience_scores else None,
        "avg_overall_score": sum(overall_scores) / len(overall_scores) if overall_scores else None,
        "recommend_count": recommend_count,
        "not_recommend_count": not_recommend_count,
        "pending_count": pending_count,
        "recommend_ratio": recommend_ratio,
        "comments": comments,
        "reviews": review_responses
    }


# ==================== HR决策 ====================

def submit_hr_decision(db: Session, resume_id: UUID, hr_id: UUID, decision_data: HRDecisionCreate) -> Resume:
    """
    HR提交最终决策
    """
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在")

    # 验证状态流转
    valid_states = [
        ResumeStatus.PENDING_HR_DECISION,
        ResumeStatus.PENDING_DEPT_REVIEW,
        ResumeStatus.PENDING_REVIEW,
        ResumeStatus.AUTO_REJECTED_PENDING_REVIEW
    ]

    if resume.status not in valid_states:
        raise HTTPException(status_code=400, detail=f"当前状态 [{resume.status.value}] 不允许HR决策")

    decision = decision_data.decision

    # 更新简历状态
    resume.status = decision
    resume.hr_review = decision_data.hr_comment

    # 如果是淘汰，记录淘汰原因
    if decision == ResumeStatus.REJECTED:
        if not decision_data.reject_reason_category:
            raise HTTPException(status_code=400, detail="淘汰时必须选择淘汰原因")
        resume.reject_reason_category = decision_data.reject_reason_category
        resume.reject_reason_detail = decision_data.reject_reason_detail
        resume.rejected_at = datetime.utcnow()
        resume.rejected_by = hr_id

    # 如果是备选
    elif decision == ResumeStatus.WAITLIST:
        resume.reject_reason_category = None
        resume.reject_reason_detail = None

    db.commit()
    db.refresh(resume)

    return resume


def confirm_rejection(db: Session, resume_id: UUID, hr_id: UUID,
                      reason_category: RejectReasonCategory, reason_detail: Optional[str] = None) -> Resume:
    """
    确认淘汰低分简历（从 AUTO_REJECTED_PENDING_REVIEW 状态）
    """
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在")

    if resume.status != ResumeStatus.AUTO_REJECTED_PENDING_REVIEW:
        raise HTTPException(status_code=400, detail="当前状态不允许此操作")

    resume.status = ResumeStatus.REJECTED
    resume.reject_reason_category = reason_category
    resume.reject_reason_detail = reason_detail
    resume.rejected_at = datetime.utcnow()
    resume.rejected_by = hr_id

    db.commit()
    db.refresh(resume)

    return resume


def override_rejection(db: Session, resume_id: UUID, hr_id: UUID) -> Resume:
    """
    覆盖AI淘汰建议（从 AUTO_REJECTED_PENDING_REVIEW 恢复到评审流程）
    """
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在")

    if resume.status != ResumeStatus.AUTO_REJECTED_PENDING_REVIEW:
        raise HTTPException(status_code=400, detail="当前状态不允许此操作")

    # 恢复到部门评审流程
    resume.status = ResumeStatus.PENDING_DEPT_REVIEW
    resume.reject_reason_category = None
    resume.reject_reason_detail = None

    db.commit()
    db.refresh(resume)

    return resume


def get_resume_with_reviews(db: Session, resume_id: UUID) -> Optional[Resume]:
    """
    获取简历详情（包含部门评审记录）
    """
    resume = db.query(Resume).options(
        joinedload(Resume.position),
        joinedload(Resume.department_reviews).joinedload(DepartmentReview.reviewer)
    ).filter(Resume.id == resume_id).first()

    return resume


def transfer_resume_position(db: Session, resume_id: UUID, new_position_id: UUID, background_tasks) -> Resume:
    """
    将简历转岗到其他岗位，并重新解析
    """
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在")

    # 检查新岗位是否存在
    new_position = db.query(Position).filter(Position.id == new_position_id).first()
    if not new_position:
        raise HTTPException(status_code=404, detail="目标岗位不存在")

    # 更新岗位
    old_position_id = resume.position_id
    resume.position_id = new_position_id

    # 清除之前的解析结果
    resume.parse_status = "processing"
    resume.parse_error = None
    resume.parsed_at = None
    resume.parsed_data = None
    resume.match_score = None
    resume.ai_review = None
    resume.screening_result = ScreeningResult.PENDING
    resume.other_position_matches = None
    resume.status = ResumeStatus.PENDING_SCREENING

    # 清除部门评审记录
    db.query(DepartmentReview).filter(DepartmentReview.resume_id == resume_id).delete()

    # 清除HR评审
    resume.hr_review = None
    resume.reject_reason_category = None
    resume.reject_reason_detail = None
    resume.rejected_at = None
    resume.rejected_by = None

    db.commit()
    db.refresh(resume)

    # 触发重新解析
    background_tasks.add_task(process_resume_background, resume.id, resume.position_id, False)

    return resume
