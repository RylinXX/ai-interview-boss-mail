from typing import Any, Dict, List
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.models.models import (
    AIEmployeeRun,
    AIEmployeeRunStatus,
    CustomerProject,
    ProjectTask,
    ProjectTaskStatus,
    Resume,
    SolutionDocument,
)
from app.schemas.business_workbench import (
    CustomerProjectCreate,
    CustomerProjectUpdate,
    ProjectTaskUpdate,
)


AI_EMPLOYEES = [
    {
        "employee_type": "business_analyst",
        "display_name": "业务分析师",
        "responsibility": "梳理客户现状、根因假设和待确认问题",
        "output_template": "诊断摘要 + 待确认问题",
        "status": "available",
    },
    {
        "employee_type": "industry_researcher",
        "display_name": "行业研究员",
        "responsibility": "补充行业模式和可参考业务路径",
        "output_template": "行业判断 + 对标模式",
        "status": "available",
    },
    {
        "employee_type": "product_manager",
        "display_name": "AI 产品经理",
        "responsibility": "把诊断转成方案模块、需求和路线图",
        "output_template": "方案模块 + PRD 要点",
        "status": "available",
    },
    {
        "employee_type": "operations_consultant",
        "display_name": "运营顾问",
        "responsibility": "设计流程优化、SOP 和交付机制",
        "output_template": "流程优化方案 + SOP 草案",
        "status": "available",
    },
    {
        "employee_type": "data_analyst",
        "display_name": "数据分析师",
        "responsibility": "设计指标、看板和验证方法",
        "output_template": "指标体系 + 验证计划",
        "status": "available",
    },
    {
        "employee_type": "implementation_planner",
        "display_name": "实施规划师",
        "responsibility": "拆解里程碑、风险和执行节奏",
        "output_template": "实施路线图 + 风险清单",
        "status": "available",
    },
]


def build_solution_content(project: CustomerProject) -> str:
    pain_points = "、".join(project.pain_points or []) or "待补充"
    goals = "、".join(project.goals or []) or "待补充"
    return (
        f"# {project.name}业务优化方案\n\n"
        f"## 客户背景\n行业：{project.industry or '待补充'}\n规模：{project.company_scale or '待补充'}\n\n"
        f"## 当前问题\n{pain_points}\n\n"
        f"## 优化目标\n{goals}\n\n"
        "## 初步路径\n围绕客户目标生成诊断任务、能力样本匹配任务和执行路线图任务。"
    )


def list_customer_projects(db: Session) -> List[CustomerProject]:
    return (
        db.query(CustomerProject)
        .options(joinedload(CustomerProject.solution_document))
        .order_by(CustomerProject.created_at.desc())
        .all()
    )


def get_customer_project(db: Session, project_id: UUID) -> CustomerProject | None:
    return (
        db.query(CustomerProject)
        .options(joinedload(CustomerProject.solution_document))
        .filter(CustomerProject.id == project_id)
        .first()
    )


def create_customer_project(
    db: Session,
    payload: CustomerProjectCreate,
    created_by: UUID | None,
) -> CustomerProject:
    project = CustomerProject(**payload.model_dump(), created_by=created_by)
    db.add(project)
    db.flush()

    document = SolutionDocument(
        project_id=project.id,
        title=f"{project.name}业务优化方案",
        content=build_solution_content(project),
        sections={"source": "initial_project_profile"},
    )
    db.add(document)
    db.commit()
    return get_customer_project(db, project.id)


def update_customer_project(
    db: Session,
    project_id: UUID,
    payload: CustomerProjectUpdate,
) -> CustomerProject | None:
    project = get_customer_project(db, project_id)
    if not project:
        return None

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, key, value)

    if project.solution_document:
        project.solution_document.content = build_solution_content(project)

    db.commit()
    return get_customer_project(db, project.id)


def generate_diagnosis(db: Session, project_id: UUID) -> CustomerProject | None:
    project = get_customer_project(db, project_id)
    if not project:
        return None

    project.diagnosis = {
        "problem_categories": ["efficiency", "growth"] if project.goals else ["discovery"],
        "root_cause_hypotheses": [
            f"{point} 可能来自流程、工具或组织协同缺口"
            for point in (project.pain_points or [])
        ],
        "optimization_opportunities": [
            f"围绕 {goal} 建立可执行项目"
            for goal in (project.goals or [])
        ],
        "next_questions": ["当前流程由哪些角色负责？", "现有数据指标是否可获得？"],
    }
    db.commit()
    return get_customer_project(db, project.id)


def generate_project_tasks(db: Session, project_id: UUID) -> List[ProjectTask]:
    project = get_customer_project(db, project_id)
    if not project:
        return []

    existing_tasks = (
        db.query(ProjectTask)
        .filter(ProjectTask.project_id == project.id)
        .order_by(ProjectTask.created_at.asc())
        .all()
    )
    if existing_tasks:
        return existing_tasks

    templates = [
        ("source_collection", "整理客户资料", "汇总客户现状、流程、痛点和目标", "形成客户背景摘要", "business_analyst"),
        ("diagnosis", "业务问题诊断", "分析根因假设和待确认问题", "形成诊断结论", "business_analyst"),
        ("capability_matching", "匹配能力样本", "从高级人才样本中寻找可参考经验", "形成能力背书", "industry_researcher"),
        ("solution_design", "设计优化方案", "把诊断转成方案模块和路线图", "形成方案大纲", "product_manager"),
        ("metrics", "设计验证指标", "定义收益、风险和验证指标", "形成指标体系", "data_analyst"),
        ("roadmap", "拆解实施路径", "拆解里程碑、任务和风险", "形成执行路线图", "implementation_planner"),
    ]
    tasks = [
        ProjectTask(
            project_id=project.id,
            stage=stage,
            title=title,
            description=description,
            expected_output=expected_output,
            ai_employee_type=employee_type,
        )
        for stage, title, description, expected_output, employee_type in templates
    ]
    db.add_all(tasks)
    db.commit()

    return (
        db.query(ProjectTask)
        .filter(ProjectTask.project_id == project.id)
        .order_by(ProjectTask.created_at.asc())
        .all()
    )


def update_project_task(db: Session, task_id: UUID, payload: ProjectTaskUpdate) -> ProjectTask | None:
    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        return None

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, key, value)

    db.commit()
    db.refresh(task)
    return task


def get_solution_document(db: Session, project_id: UUID) -> SolutionDocument | None:
    return db.query(SolutionDocument).filter(SolutionDocument.project_id == project_id).first()


def update_solution_document(db: Session, project_id: UUID, content: str) -> SolutionDocument | None:
    document = get_solution_document(db, project_id)
    if not document:
        return None

    document.content = content
    db.commit()
    db.refresh(document)
    return document


def list_ai_employees() -> List[Dict[str, str]]:
    return AI_EMPLOYEES


def list_capability_samples(db: Session) -> List[Dict[str, Any]]:
    resumes = (
        db.query(Resume)
        .filter(Resume.parse_status == "success")
        .order_by(Resume.created_at.desc())
        .all()
    )
    samples = []
    for resume in resumes:
        parsed = resume.parsed_data or {}
        work = parsed.get("work_experiences") or []
        projects = parsed.get("project_experiences") or []
        functions = [
            item.get("role")
            for item in work
            if isinstance(item, dict) and item.get("role")
        ]
        samples.append(
            {
                "resume_id": resume.id,
                "sample_name": f"{resume.candidate_name or '匿名样本'}能力样本",
                "industry_key": parsed.get("industry_key"),
                "industry_label": parsed.get("industry_label"),
                "functions": functions,
                "capabilities": functions,
                "project_patterns": [
                    item.get("name")
                    for item in projects
                    if isinstance(item, dict) and item.get("name")
                ],
                "methodology_tags": [parsed.get("logic_analysis")] if parsed.get("logic_analysis") else [],
            }
        )
    return samples


def create_ai_employee_run(db: Session, task_id: UUID) -> AIEmployeeRun | None:
    task = (
        db.query(ProjectTask)
        .options(joinedload(ProjectTask.project))
        .filter(ProjectTask.id == task_id)
        .first()
    )
    if not task:
        return None

    output = {
        "draft": f"{task.title}：基于 {task.project.name} 的项目背景，建议先完成「{task.expected_output or task.title}」。",
        "assumptions": ["当前输出为 AI 员工 MVP 草稿，需要顾问审核"],
        "follow_up_questions": ["是否已有可引用的客户数据？", "是否需要补充行业对标？"],
        "suggested_document_updates": [task.expected_output or task.title],
    }
    run = AIEmployeeRun(
        task_id=task.id,
        employee_type=task.ai_employee_type or "business_analyst",
        prompt_context={"project_name": task.project.name, "task_title": task.title},
        output=output,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def accept_ai_employee_run(db: Session, run_id: UUID) -> AIEmployeeRun | None:
    run = (
        db.query(AIEmployeeRun)
        .options(joinedload(AIEmployeeRun.task).joinedload(ProjectTask.project))
        .filter(AIEmployeeRun.id == run_id)
        .first()
    )
    if not run:
        return None

    run.status = AIEmployeeRunStatus.ACCEPTED
    run.reviewer_decision = "accepted"
    run.task.status = ProjectTaskStatus.REVIEW
    run.task.output = run.output

    document = get_solution_document(db, run.task.project_id)
    if document:
        document.content = f"{document.content}\n\n## {run.task.title}\n{run.output.get('draft', '')}"

    db.commit()
    db.refresh(run)
    return run


def discard_ai_employee_run(db: Session, run_id: UUID) -> AIEmployeeRun | None:
    run = db.query(AIEmployeeRun).filter(AIEmployeeRun.id == run_id).first()
    if not run:
        return None

    run.status = AIEmployeeRunStatus.DISCARDED
    run.reviewer_decision = "discarded"
    db.commit()
    db.refresh(run)
    return run
