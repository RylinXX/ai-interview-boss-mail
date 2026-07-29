from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from app.config.database import get_db
from app.schemas.resume import (
    ResumeResponse, ResumeCreate, ResumeUpdate, ResumeMetricsResponse,
    ResumeOptionResponse, ResumePageResponse,
    DepartmentReviewCreate, DepartmentReviewUpdate, DepartmentReviewResponse,
    HRDecisionCreate, HRDecisionResponse, IndustryAgentSolutionRequest,
    IndustryAgentSolutionDraftResponse, IndustryAgentSolutionResponse,
    DuplicateCheckRequest, DuplicateCheckResponse, DepartmentReviewSummary,
    ResumeParsedDataUpdate, ResumeAIAugmentRequest
)
from app.services.resume_service import (
    upload_resume, get_resumes, get_resume, get_resume_metrics, get_resume_options, get_resume_page, update_resume, delete_resume,
    batch_upload_resumes, reparse_resume, reparse_failed_resumes,
    summarize_resume_experiences, summarize_resume_projects, summarize_industry_solution_agent,
    create_industry_solution_draft, generate_industry_solution_from_agent,
    get_industry_solution_draft, get_latest_industry_solution_draft,
    run_industry_solution_draft,
    check_duplicate_resume, create_department_review, get_department_reviews,
    complete_department_review, aggregate_department_reviews, submit_hr_decision,
    confirm_rejection, override_rejection, get_resume_with_reviews, transfer_resume_position,
    export_resume_analysis_report
)
from app.services.task_queue import get_task_queue
from app.models.models import ResumeStatus, RejectReasonCategory, User, UserRole, Resume
from app.core.security import check_roles
from app.routes.auth import get_current_user
from typing import List, Dict, Any, Optional
from uuid import UUID

router = APIRouter(
    prefix="/resumes",
    tags=["resumes"]
)

# ==================== 简历列表 ====================

@router.get("", response_model=List[ResumeResponse])
def get_resumes_route(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=1000),
    candidate_name: str = None,
    status: str = None,
    position_id: Optional[UUID] = None,
    reviewer_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return get_resumes(db, skip=skip, limit=limit, candidate_name=candidate_name, status=status, position_id=position_id, reviewer_id=reviewer_id)


@router.get("/options", response_model=List[ResumeOptionResponse])
def get_resume_options_route(
    status: str = None,
    statuses: str = None,
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    status_values = [value.strip() for value in (statuses or "").split(",") if value.strip()]
    if status:
        status_values.append(status)
    try:
        status_values = [ResumeStatus(value).value for value in status_values]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="无效的样本状态") from exc
    return get_resume_options(db, statuses=status_values, limit=limit)


@router.get("/page", response_model=ResumePageResponse)
def get_resume_page_route(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=1000),
    candidate_name: str = None,
    parse_status: str = None,
    position_id: Optional[UUID] = None,
    min_score: Optional[int] = None,
    max_score: Optional[int] = None,
    score_range: Optional[str] = None,
    school_tag: Optional[str] = None,
    company_tag: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_resume_page(
        db,
        skip=skip,
        limit=limit,
        candidate_name=candidate_name,
        parse_status=parse_status,
        position_id=position_id,
        min_score=min_score,
        max_score=max_score,
        score_range=score_range,
        school_tag=school_tag,
        company_tag=company_tag,
    )


@router.get("/metrics", response_model=ResumeMetricsResponse)
def get_resume_metrics_route(
    candidate_name: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_resume_metrics(db, candidate_name=candidate_name)

# ==================== 简历查重 ====================

@router.post("/check-duplicate", response_model=DuplicateCheckResponse)
def check_duplicate_route(
    request: DuplicateCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    检查简历是否重复（基于邮箱/手机号）
    """
    existing = check_duplicate_resume(db, request.email, request.contact, request.position_id)

    if existing:
        return DuplicateCheckResponse(
            is_duplicate=True,
            existing_resume=ResumeResponse.model_validate(existing),
            message=f"发现重复简历：{existing.candidate_name or '未知候选人'}"
        )

    return DuplicateCheckResponse(
        is_duplicate=False,
        existing_resume=None,
        message="未发现重复简历"
    )

# ==================== 简历上传 ====================

def validate_pdf_file(file: UploadFile):
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="只允许上传 PDF 格式的文件")
    if file.content_type and file.content_type != 'application/pdf':
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="只允许上传 PDF 格式的文件")
    return file

# 注意：单简历上传保持公开，因为应聘者可能通过公开链接投递
@router.post("", response_model=ResumeResponse)
def create_resume_route(
    background_tasks: BackgroundTasks,
    position_id: Optional[UUID] = Form(None),
    file: UploadFile = File(...),
    candidate_name: str = Form(None),  # 公开链接上传时由应聘者填写
    email: str = Form(None),
    contact: str = Form(None),
    db: Session = Depends(get_db)
):
    validate_pdf_file(file)
    return upload_resume(db, file, position_id, background_tasks, candidate_name, email, contact)

@router.post("/batch", response_model=List[ResumeResponse])
def batch_upload_resumes_route(
    background_tasks: BackgroundTasks,
    position_id: Optional[UUID] = Form(None),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(check_roles([UserRole.ADMIN, UserRole.HR]))
):
    for f in files:
        validate_pdf_file(f)
    return batch_upload_resumes(db, files, position_id, background_tasks)

@router.post("/reparse-failed")
def reparse_failed_resumes_route(
    background_tasks: BackgroundTasks,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_roles([UserRole.ADMIN, UserRole.HR]))
):
    return reparse_failed_resumes(db, background_tasks, limit=limit)


@router.get("/experience-summary")
def get_resume_experience_summary_route(
    limit: int = 500,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return summarize_resume_experiences(db, limit=limit)


@router.get("/project-library")
def get_resume_project_library_route(
    limit: int = 500,
    missing_only: bool = False,
    candidate_name: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return summarize_resume_projects(
        db,
        limit=limit,
        missing_only=missing_only,
        candidate_name=candidate_name,
    )


@router.get("/queue-stats")
def get_resume_queue_stats_route(
    current_user: User = Depends(get_current_user)
):
    return get_task_queue().get_stats()


@router.get("/industry-agent")
def get_industry_solution_agent_route(
    limit: int = 500,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return summarize_industry_solution_agent(db, limit=limit)


@router.post("/industry-agent/solution", response_model=IndustryAgentSolutionResponse)
def generate_industry_solution_agent_route(
    request: IndustryAgentSolutionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return generate_industry_solution_from_agent(db, request.model_dump())


@router.post("/industry-agent/solution-drafts", response_model=IndustryAgentSolutionDraftResponse)
def create_industry_solution_draft_route(
    request: IndustryAgentSolutionRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    draft = create_industry_solution_draft(db, request.model_dump(), current_user.id)
    background_tasks.add_task(run_industry_solution_draft, draft.id)
    return draft


@router.get("/industry-agent/solution-drafts/latest", response_model=Optional[IndustryAgentSolutionDraftResponse])
def get_latest_industry_solution_draft_route(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return get_latest_industry_solution_draft(db, current_user.id)


@router.get("/industry-agent/solution-drafts/{draft_id}", response_model=IndustryAgentSolutionDraftResponse)
def get_industry_solution_draft_route(
    draft_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    draft = get_industry_solution_draft(db, draft_id, current_user.id)
    if not draft:
        raise HTTPException(status_code=404, detail="Solution draft not found")
    return draft

# ==================== 简历详情与更新 ====================

@router.get("/{resume_id}", response_model=ResumeResponse)
def get_resume_route(
    resume_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    resume = get_resume_with_reviews(db, resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return resume

@router.put("/{resume_id}", response_model=ResumeResponse)
def update_resume_route(
    resume_id: UUID,
    resume: ResumeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_roles([UserRole.ADMIN, UserRole.HR]))
):
    db_resume = update_resume(db, resume_id, resume)
    if not db_resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return db_resume

@router.delete("/{resume_id}", response_model=ResumeResponse)
def delete_resume_route(
    resume_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_roles([UserRole.ADMIN, UserRole.HR]))
):
    db_resume = delete_resume(db, resume_id)
    if not db_resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return db_resume

@router.post("/{resume_id}/reparse", response_model=ResumeResponse)
def reparse_resume_route(
    resume_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_roles([UserRole.ADMIN, UserRole.HR]))
):
    resume = reparse_resume(db, resume_id, background_tasks)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return resume


@router.get("/{resume_id}/export")
def export_resume_analysis_route(
    resume_id: UUID,
    format: str = "markdown",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    content = export_resume_analysis_report(db, resume_id, format)
    if not content:
        raise HTTPException(status_code=404, detail="Resume not found")
    return PlainTextResponse(content=content)

# ==================== 部门评审 ====================

@router.get("/{resume_id}/department-reviews", response_model=DepartmentReviewSummary)
def get_department_reviews_route(
    resume_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取部门评审汇总报告
    """
    return aggregate_department_reviews(db, resume_id)


@router.post("/{resume_id}/department-reviews", response_model=DepartmentReviewResponse)
def create_department_review_route(
    resume_id: UUID,
    reviewer_id: UUID = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(check_roles([UserRole.ADMIN, UserRole.HR]))
):
    """
    指派部门评审人
    """
    return create_department_review(db, resume_id, reviewer_id)


@router.put("/{resume_id}/department-reviews/{review_id}", response_model=DepartmentReviewResponse)
def complete_department_review_route(
    resume_id: UUID,
    review_id: UUID,
    reviewer_id: UUID = Form(...),
    technical_score: int = Form(None),
    experience_score: int = Form(None),
    overall_score: int = Form(None),
    recommendation: str = Form(None),
    comment: str = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    完成部门评审
    """
    review_data = DepartmentReviewUpdate(
        technical_score=technical_score,
        experience_score=experience_score,
        overall_score=overall_score,
        recommendation=recommendation,
        comment=comment
    )
    return complete_department_review(db, review_id, reviewer_id, review_data)

# ==================== HR决策 ====================

@router.post("/{resume_id}/hr-decision", response_model=ResumeResponse)
def submit_hr_decision_route(
    resume_id: UUID,
    decision_data: HRDecisionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_roles([UserRole.ADMIN, UserRole.HR]))
):
    """
    HR提交最终决策
    """
    return submit_hr_decision(db, resume_id, decision_data.hr_id, decision_data)


@router.post("/{resume_id}/confirm-rejection", response_model=ResumeResponse)
def confirm_rejection_route(
    resume_id: UUID,
    reason_category: str = Form(...),
    reason_detail: str = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(check_roles([UserRole.ADMIN, UserRole.HR]))
):
    """
    确认淘汰低分简历
    """
    try:
        reason_category_enum = RejectReasonCategory(reason_category)
    except ValueError:
        valid_values = [e.value for e in RejectReasonCategory]
        raise HTTPException(status_code=400, detail=f"无效的淘汰原因，有效值为: {valid_values}")

    hr_id = current_user.id
    return confirm_rejection(db, resume_id, hr_id, reason_category_enum, reason_detail)


@router.post("/{resume_id}/override-rejection", response_model=ResumeResponse)
def override_rejection_route(
    resume_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_roles([UserRole.ADMIN, UserRole.HR]))
):
    """
    覆盖AI淘汰建议，恢复到评审流程
    """
    hr_id = current_user.id
    return override_rejection(db, resume_id, hr_id)


@router.post("/{resume_id}/transfer", response_model=ResumeResponse)
def transfer_resume_position_route(
    resume_id: UUID,
    background_tasks: BackgroundTasks,
    new_position_id: UUID = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(check_roles([UserRole.ADMIN, UserRole.HR]))
):
    """
    将简历转岗到其他岗位，并重新解析
    """
    return transfer_resume_position(db, resume_id, new_position_id, background_tasks)


@router.get("/queue/status")
def get_queue_status(
    current_user: User = Depends(check_roles([UserRole.ADMIN, UserRole.HR]))
):
    from app.services.task_queue import get_task_queue
    queue = get_task_queue()
    return queue.get_stats()


@router.get("/queue/task/{task_id}")
def get_task_status(
    task_id: str,
    current_user: User = Depends(check_roles([UserRole.ADMIN, UserRole.HR]))
):
    from app.services.task_queue import get_task_queue
    queue = get_task_queue()
    status = queue.get_status(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Task not found")
    return status


@router.post("/fix-stuck")
def fix_stuck_resumes(
    db: Session = Depends(get_db),
    current_user: User = Depends(check_roles([UserRole.ADMIN, UserRole.HR]))
):
    from datetime import datetime, timedelta
    from app.services.task_queue import get_task_queue

    queue = get_task_queue()
    queue_stats = queue.get_stats()

    stuck_resumes = db.query(Resume).filter(
        Resume.parse_status == "processing",
        Resume.updated_at < datetime.utcnow() - timedelta(minutes=10)
    ).all()

    fixed_count = 0
    for resume in stuck_resumes:
        task_status = queue.get_status(str(resume.id))

        if task_status is None or task_status["status"] in ["completed", "failed"]:
            resume.parse_status = "failed"
            resume.parse_error = "解析超时，请重新解析"
            resume.candidate_name = "解析失败"
            fixed_count += 1

    db.commit()

    return {
        "fixed_count": fixed_count,
        "queue_stats": queue_stats
    }


@router.put("/{resume_id}/parsed-data")
def update_resume_parsed_data_route(
    resume_id: UUID,
    payload: ResumeParsedDataUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在")

    # 深度更新 parsed_data
    parsed_data = dict(resume.parsed_data or {})

    if payload.project_experiences is not None:
        parsed_data["project_experiences"] = payload.project_experiences
    if payload.logic_analysis is not None:
        parsed_data["logic_analysis"] = payload.logic_analysis
    if payload.startup_landing_ideas is not None:
        parsed_data["startup_landing_ideas"] = payload.startup_landing_ideas
    if payload.work_experiences is not None:
        parsed_data["work_experiences"] = payload.work_experiences

    resume.parsed_data = parsed_data
    db.commit()
    db.refresh(resume)
    return {"status": "success", "parsed_data": resume.parsed_data}


@router.post("/{resume_id}/ai-augment")
def ai_augment_resume_field_route(
    resume_id: UUID,
    payload: ResumeAIAugmentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="简历不存在")

    from app.services.ai_service import generate_text

    prompt = f"""你是一个资深的商业分析顾问专家。
当前我们正在分析一名候选人的简历样本，并沉淀该项目的商业打法和商业模式。

候选人姓名：{resume.candidate_name or "未识别"}
项目名称：{payload.project_name}
当前上下文内容：{payload.current_value or "暂无"}

现在，顾问对该项目的商业模式或落地细节发起了追问，请针对该追问，结合候选人的技术能力、公司职级以及任职背景，智能且客观地进行合理分析并给出详细补充。
顾问追问问题：{payload.question}

请注意：
1. 你的回答需要专业、切中商业落地的本质，语言要凝练、富有咨询顾问的客观感。
2. 直接返回增补或解答的 Markdown 内容段落，不要包含多余的问候语或“好的，收到”等废话。
"""
    try:
        reply = generate_text(prompt)
        return {"status": "success", "suggestion": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"大模型增补失败: {str(e)}")
