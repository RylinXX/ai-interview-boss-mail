# AI Business Workbench MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first internal AI business optimization workbench path: customer projects, capability samples, project task board, solution document, and AI employee MVP runs.

**Architecture:** Add a new business-workbench domain beside the existing resume domain. Keep existing resume parsing intact and derive lightweight capability samples from `Resume.parsed_data`; use project-scoped tasks and solution documents as the main workflow, with manually triggered AI employee runs that create reviewable draft outputs.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy, Pydantic v2, pytest, React 19, React Router, Ant Design, Vite

---

### Task 1: Backend Business Workbench Domain

**Files:**
- Modify: `backend/app/models/models.py`
- Create: `backend/app/schemas/business_workbench.py`
- Create: `backend/app/services/business_workbench_service.py`
- Create: `backend/app/routes/business_workbench.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_business_workbench_routes.py`

- [ ] **Step 1: Write failing route tests**

Add `backend/tests/test_business_workbench_routes.py`:

```python
from uuid import uuid4

from app.models.models import Resume, ResumeStatus, ScreeningResult


def test_create_customer_project_generates_solution_document(client, admin_auth_headers):
    response = client.post(
        "/api/customer-projects",
        headers=admin_auth_headers,
        json={
            "name": "样板客户",
            "industry": "制造业",
            "company_scale": "200-500人",
            "business_model": "设备销售加售后服务",
            "pain_points": ["交付周期长", "售后响应慢"],
            "goals": ["提升交付效率", "建立售后知识库"],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "样板客户"
    assert data["status"] == "draft"
    assert data["solution_document"]["title"] == "样板客户业务优化方案"
    assert "交付周期长" in data["solution_document"]["content"]


def test_generate_project_tasks_and_ai_employee_run(client, admin_auth_headers):
    project = client.post(
        "/api/customer-projects",
        headers=admin_auth_headers,
        json={
            "name": "增长客户",
            "industry": "电商",
            "company_scale": "50-100人",
            "business_model": "直播电商",
            "pain_points": ["复购低"],
            "goals": ["提升私域复购"],
        },
    ).json()

    task_response = client.post(
        f"/api/customer-projects/{project['id']}/tasks/generate",
        headers=admin_auth_headers,
    )

    assert task_response.status_code == 200
    tasks = task_response.json()
    assert len(tasks) >= 4
    assert {item["status"] for item in tasks} == {"todo"}
    assert any(item["ai_employee_type"] == "business_analyst" for item in tasks)

    task_id = tasks[0]["id"]
    run_response = client.post(
        f"/api/project-tasks/{task_id}/ai-runs",
        headers=admin_auth_headers,
    )

    assert run_response.status_code == 200
    run = run_response.json()
    assert run["status"] == "draft"
    assert run["task_id"] == task_id
    assert run["output"]["draft"]

    accept_response = client.post(
        f"/api/ai-runs/{run['id']}/accept",
        headers=admin_auth_headers,
    )

    assert accept_response.status_code == 200
    assert accept_response.json()["status"] == "accepted"


def test_capability_samples_are_derived_from_resumes(client, admin_auth_headers, db):
    resume = Resume(
        id=uuid4(),
        candidate_name="能力样本",
        file_path="uploads/resumes/sample.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        parsed_data={
            "industry_label": "零售电商",
            "industry_key": "retail_ecommerce",
            "work_experiences": [{"role": "增长负责人", "summary": "负责私域复购"}],
            "project_experiences": [{"name": "会员增长", "business_model": "会员体系"}],
            "logic_analysis": "擅长增长和数据复盘",
        },
    )
    db.add(resume)
    db.commit()

    response = client.get("/api/capability-samples", headers=admin_auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data[0]["resume_id"] == str(resume.id)
    assert data[0]["industry_label"] == "零售电商"
    assert "增长负责人" in data[0]["capabilities"]
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
backend/venv/bin/python -m pytest backend/tests/test_business_workbench_routes.py -q
```

Expected: fail because the route module, schemas, and models do not exist.

- [ ] **Step 3: Add SQLAlchemy models**

Append the following focused models to `backend/app/models/models.py` after `SystemConfig`:

```python
class CustomerProjectStatus(str, enum.Enum):
    DRAFT = "draft"
    DIAGNOSING = "diagnosing"
    DESIGNING = "designing"
    READY = "ready"
    ARCHIVED = "archived"


class ProjectTaskStatus(str, enum.Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    REVIEW = "review"
    DONE = "done"
    BLOCKED = "blocked"


class AIEmployeeRunStatus(str, enum.Enum):
    DRAFT = "draft"
    ACCEPTED = "accepted"
    DISCARDED = "discarded"


class CustomerProject(Base):
    __tablename__ = "customer_projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    industry = Column(String)
    company_scale = Column(String)
    business_model = Column(Text)
    pain_points = Column(JSON, default=list)
    goals = Column(JSON, default=list)
    status = Column(Enum(CustomerProjectStatus), default=CustomerProjectStatus.DRAFT)
    diagnosis = Column(JSON, default=dict)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    creator = relationship("User")
    tasks = relationship("ProjectTask", back_populates="project", cascade="all, delete-orphan")
    solution_document = relationship("SolutionDocument", back_populates="project", uselist=False, cascade="all, delete-orphan")


class ProjectTask(Base):
    __tablename__ = "project_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("customer_projects.id"), nullable=False)
    stage = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text)
    expected_output = Column(Text)
    status = Column(Enum(ProjectTaskStatus), default=ProjectTaskStatus.TODO)
    assignee_type = Column(String, default="ai_employee")
    ai_employee_type = Column(String)
    linked_capability_sample_ids = Column(JSON, default=list)
    output = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("CustomerProject", back_populates="tasks")
    ai_runs = relationship("AIEmployeeRun", back_populates="task", cascade="all, delete-orphan")


class SolutionDocument(Base):
    __tablename__ = "solution_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("customer_projects.id"), nullable=False, unique=True)
    title = Column(String, nullable=False)
    content = Column(Text, default="")
    sections = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("CustomerProject", back_populates="solution_document")


class AIEmployeeRun(Base):
    __tablename__ = "ai_employee_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("project_tasks.id"), nullable=False)
    employee_type = Column(String, nullable=False)
    status = Column(Enum(AIEmployeeRunStatus), default=AIEmployeeRunStatus.DRAFT)
    prompt_context = Column(JSON, default=dict)
    output = Column(JSON, default=dict)
    reviewer_decision = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    task = relationship("ProjectTask", back_populates="ai_runs")
```

- [ ] **Step 4: Add schemas**

Create `backend/app/schemas/business_workbench.py` with request/response models:

```python
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.models import AIEmployeeRunStatus, CustomerProjectStatus, ProjectTaskStatus


class SolutionDocumentResponse(BaseModel):
    id: UUID
    project_id: UUID
    title: str
    content: str
    sections: Dict[str, Any] = {}
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CustomerProjectCreate(BaseModel):
    name: str
    industry: Optional[str] = None
    company_scale: Optional[str] = None
    business_model: Optional[str] = None
    pain_points: List[str] = []
    goals: List[str] = []


class CustomerProjectUpdate(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    company_scale: Optional[str] = None
    business_model: Optional[str] = None
    pain_points: Optional[List[str]] = None
    goals: Optional[List[str]] = None
    status: Optional[CustomerProjectStatus] = None


class CustomerProjectResponse(BaseModel):
    id: UUID
    name: str
    industry: Optional[str] = None
    company_scale: Optional[str] = None
    business_model: Optional[str] = None
    pain_points: List[str] = []
    goals: List[str] = []
    status: CustomerProjectStatus
    diagnosis: Dict[str, Any] = {}
    created_at: datetime
    updated_at: Optional[datetime] = None
    solution_document: Optional[SolutionDocumentResponse] = None

    model_config = ConfigDict(from_attributes=True)


class ProjectTaskResponse(BaseModel):
    id: UUID
    project_id: UUID
    stage: str
    title: str
    description: Optional[str] = None
    expected_output: Optional[str] = None
    status: ProjectTaskStatus
    assignee_type: Optional[str] = None
    ai_employee_type: Optional[str] = None
    linked_capability_sample_ids: List[str] = []
    output: Dict[str, Any] = {}
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ProjectTaskUpdate(BaseModel):
    status: Optional[ProjectTaskStatus] = None
    output: Optional[Dict[str, Any]] = None


class AIEmployeeResponse(BaseModel):
    employee_type: str
    display_name: str
    responsibility: str
    output_template: str
    status: str = "available"


class AIEmployeeRunResponse(BaseModel):
    id: UUID
    task_id: UUID
    employee_type: str
    status: AIEmployeeRunStatus
    prompt_context: Dict[str, Any] = {}
    output: Dict[str, Any] = {}
    reviewer_decision: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CapabilitySampleResponse(BaseModel):
    resume_id: UUID
    sample_name: str
    industry_key: Optional[str] = None
    industry_label: Optional[str] = None
    functions: List[str] = []
    capabilities: List[str] = []
    project_patterns: List[str] = []
    methodology_tags: List[str] = []
```

- [ ] **Step 5: Add service functions**

Create `backend/app/services/business_workbench_service.py` with deterministic MVP generation helpers:

```python
from typing import Any, Dict, List
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.models.models import (
    AIEmployeeRun, AIEmployeeRunStatus, CustomerProject, ProjectTask,
    ProjectTaskStatus, Resume, SolutionDocument,
)
from app.schemas.business_workbench import CustomerProjectCreate, CustomerProjectUpdate, ProjectTaskUpdate


AI_EMPLOYEES = [
    {"employee_type": "business_analyst", "display_name": "业务分析师", "responsibility": "梳理客户现状、根因假设和待确认问题", "output_template": "诊断摘要 + 待确认问题"},
    {"employee_type": "industry_researcher", "display_name": "行业研究员", "responsibility": "补充行业模式和可参考业务路径", "output_template": "行业判断 + 对标模式"},
    {"employee_type": "product_manager", "display_name": "AI 产品经理", "responsibility": "把诊断转成方案模块、需求和路线图", "output_template": "方案模块 + PRD 要点"},
    {"employee_type": "operations_consultant", "display_name": "运营顾问", "responsibility": "设计流程优化、SOP 和交付机制", "output_template": "流程优化方案 + SOP 草案"},
    {"employee_type": "data_analyst", "display_name": "数据分析师", "responsibility": "设计指标、看板和验证方法", "output_template": "指标体系 + 验证计划"},
    {"employee_type": "implementation_planner", "display_name": "实施规划师", "responsibility": "拆解里程碑、风险和执行节奏", "output_template": "实施路线图 + 风险清单"},
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
```

Continue the same file with these explicit service functions:

```python
def list_customer_projects(db: Session) -> List[CustomerProject]:
    return db.query(CustomerProject).options(joinedload(CustomerProject.solution_document)).order_by(CustomerProject.created_at.desc()).all()


def get_customer_project(db: Session, project_id: UUID) -> CustomerProject | None:
    return db.query(CustomerProject).options(joinedload(CustomerProject.solution_document)).filter(CustomerProject.id == project_id).first()


def create_customer_project(db: Session, payload: CustomerProjectCreate, created_by: UUID | None) -> CustomerProject:
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
    db.refresh(project)
    return get_customer_project(db, project.id)


def update_customer_project(db: Session, project_id: UUID, payload: CustomerProjectUpdate) -> CustomerProject | None:
    project = get_customer_project(db, project_id)
    if not project:
        return None
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    if project.solution_document:
        project.solution_document.content = build_solution_content(project)
    db.commit()
    db.refresh(project)
    return get_customer_project(db, project.id)


def generate_diagnosis(db: Session, project_id: UUID) -> CustomerProject | None:
    project = get_customer_project(db, project_id)
    if not project:
        return None
    project.diagnosis = {
        "problem_categories": ["efficiency", "growth"] if project.goals else ["discovery"],
        "root_cause_hypotheses": [f"{point} 可能来自流程、工具或组织协同缺口" for point in (project.pain_points or [])],
        "optimization_opportunities": [f"围绕 {goal} 建立可执行项目" for goal in (project.goals or [])],
        "next_questions": ["当前流程由哪些角色负责？", "现有数据指标是否可获得？"],
    }
    db.commit()
    db.refresh(project)
    return get_customer_project(db, project.id)


def generate_project_tasks(db: Session, project_id: UUID) -> List[ProjectTask]:
    project = get_customer_project(db, project_id)
    if not project:
        return []
    if project.tasks:
        return sorted(project.tasks, key=lambda item: item.created_at)
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
    return db.query(ProjectTask).filter(ProjectTask.project_id == project.id).order_by(ProjectTask.created_at.asc()).all()


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
    resumes = db.query(Resume).filter(Resume.parse_status == "success").order_by(Resume.created_at.desc()).all()
    samples = []
    for resume in resumes:
        parsed = resume.parsed_data or {}
        work = parsed.get("work_experiences") or []
        projects = parsed.get("project_experiences") or []
        samples.append({
            "resume_id": resume.id,
            "sample_name": f"{resume.candidate_name or '匿名样本'}能力样本",
            "industry_key": parsed.get("industry_key"),
            "industry_label": parsed.get("industry_label"),
            "functions": [item.get("role") for item in work if isinstance(item, dict) and item.get("role")],
            "capabilities": [item.get("role") for item in work if isinstance(item, dict) and item.get("role")],
            "project_patterns": [item.get("name") for item in projects if isinstance(item, dict) and item.get("name")],
            "methodology_tags": [parsed.get("logic_analysis")] if parsed.get("logic_analysis") else [],
        })
    return samples


def create_ai_employee_run(db: Session, task_id: UUID) -> AIEmployeeRun | None:
    task = db.query(ProjectTask).options(joinedload(ProjectTask.project)).filter(ProjectTask.id == task_id).first()
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
    run = db.query(AIEmployeeRun).options(joinedload(AIEmployeeRun.task).joinedload(ProjectTask.project)).filter(AIEmployeeRun.id == run_id).first()
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
```

- [ ] **Step 6: Add routes and register them**

Create `backend/app/routes/business_workbench.py` with these route handlers:

```python
router = APIRouter(tags=["business-workbench"])

@router.get("/customer-projects", response_model=list[CustomerProjectResponse])
def list_projects_route(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return service.list_customer_projects(db)

@router.post("/customer-projects", response_model=CustomerProjectResponse)
def create_project_route(payload: CustomerProjectCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return service.create_customer_project(db, payload, current_user.id)
```

Continue the same route file with:

```python
@router.get("/customer-projects/{project_id}", response_model=CustomerProjectResponse)
def get_project_route(project_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = service.get_customer_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Customer project not found")
    return project


@router.put("/customer-projects/{project_id}", response_model=CustomerProjectResponse)
def update_project_route(project_id: UUID, payload: CustomerProjectUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = service.update_customer_project(db, project_id, payload)
    if not project:
        raise HTTPException(status_code=404, detail="Customer project not found")
    return project


@router.post("/customer-projects/{project_id}/diagnose", response_model=CustomerProjectResponse)
def diagnose_project_route(project_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = service.generate_diagnosis(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Customer project not found")
    return project


@router.get("/customer-projects/{project_id}/tasks", response_model=list[ProjectTaskResponse])
def list_tasks_route(project_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return service.generate_project_tasks(db, project_id)


@router.post("/customer-projects/{project_id}/tasks/generate", response_model=list[ProjectTaskResponse])
def generate_tasks_route(project_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tasks = service.generate_project_tasks(db, project_id)
    if not tasks and not service.get_customer_project(db, project_id):
        raise HTTPException(status_code=404, detail="Customer project not found")
    return tasks


@router.put("/project-tasks/{task_id}", response_model=ProjectTaskResponse)
def update_task_route(task_id: UUID, payload: ProjectTaskUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = service.update_project_task(db, task_id, payload)
    if not task:
        raise HTTPException(status_code=404, detail="Project task not found")
    return task


@router.get("/customer-projects/{project_id}/solution-document", response_model=SolutionDocumentResponse)
def get_solution_document_route(project_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    document = service.get_solution_document(db, project_id)
    if not document:
        raise HTTPException(status_code=404, detail="Solution document not found")
    return document


@router.put("/customer-projects/{project_id}/solution-document", response_model=SolutionDocumentResponse)
def update_solution_document_route(project_id: UUID, payload: Dict[str, str], db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    document = service.update_solution_document(db, project_id, payload.get("content", ""))
    if not document:
        raise HTTPException(status_code=404, detail="Solution document not found")
    return document


@router.post("/customer-projects/{project_id}/solution-document/export")
def export_solution_document_route(project_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    document = service.get_solution_document(db, project_id)
    if not document:
        raise HTTPException(status_code=404, detail="Solution document not found")
    return PlainTextResponse(content=document.content)


@router.get("/capability-samples", response_model=list[CapabilitySampleResponse])
def list_capability_samples_route(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return service.list_capability_samples(db)


@router.get("/ai-employees", response_model=list[AIEmployeeResponse])
def list_ai_employees_route(current_user: User = Depends(get_current_user)):
    return service.list_ai_employees()


@router.post("/project-tasks/{task_id}/ai-runs", response_model=AIEmployeeRunResponse)
def create_ai_run_route(task_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    run = service.create_ai_employee_run(db, task_id)
    if not run:
        raise HTTPException(status_code=404, detail="Project task not found")
    return run


@router.get("/project-tasks/{task_id}/ai-runs", response_model=list[AIEmployeeRunResponse])
def list_ai_runs_route(task_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(AIEmployeeRun).filter(AIEmployeeRun.task_id == task_id).order_by(AIEmployeeRun.created_at.desc()).all()


@router.post("/ai-runs/{run_id}/accept", response_model=AIEmployeeRunResponse)
def accept_ai_run_route(run_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    run = service.accept_ai_employee_run(db, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="AI employee run not found")
    return run


@router.post("/ai-runs/{run_id}/discard", response_model=AIEmployeeRunResponse)
def discard_ai_run_route(run_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    run = service.discard_ai_employee_run(db, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="AI employee run not found")
    return run
```

Register the route in `backend/app/main.py`:

```python
from app.routes import auth, resumes, settings, resume_mail_imports, business_workbench

app.include_router(business_workbench.router, prefix="/api")
```

Update `backend/tests/conftest.py` test app registration:

```python
from app.routes import auth, positions, resumes, interviews, coding_tests, settings, resume_mail_imports, business_workbench
test_app.include_router(business_workbench.router, prefix="/api")
```

- [ ] **Step 7: Run tests and commit**

Run:

```bash
backend/venv/bin/python -m pytest backend/tests/test_business_workbench_routes.py -q
backend/venv/bin/python -m pytest backend/tests/test_resume_intelligence_service.py -q
```

Expected: both pass.

Commit:

```bash
git add backend/app/models/models.py backend/app/schemas/business_workbench.py backend/app/services/business_workbench_service.py backend/app/routes/business_workbench.py backend/app/main.py backend/tests/conftest.py backend/tests/test_business_workbench_routes.py
git commit -m "feat: add business workbench backend"
```

### Task 2: Frontend Navigation And Workbench Pages

**Files:**
- Modify: `frontend/src/router/index.tsx`
- Modify: `frontend/src/components/Layout/index.tsx`
- Create: `frontend/src/pages/CustomerProjects/List.tsx`
- Create: `frontend/src/pages/CustomerProjects/Detail.tsx`
- Create: `frontend/src/pages/AIEmployees/List.tsx`
- Modify: `frontend/src/pages/Dashboard/index.tsx`
- Modify: `frontend/src/pages/IndustryAgent/index.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add routes**

Add lazy imports and routes:

```tsx
const CustomerProjectsList = lazy(() => import('../pages/CustomerProjects/List'));
const CustomerProjectDetail = lazy(() => import('../pages/CustomerProjects/Detail'));
const AIEmployeesList = lazy(() => import('../pages/AIEmployees/List'));

{ path: 'customer-projects', element: lazyPage(<CustomerProjectsList />) },
{ path: 'customer-projects/:id', element: lazyPage(<CustomerProjectDetail />) },
{ path: 'ai-employees', element: lazyPage(<AIEmployeesList />) },
```

- [ ] **Step 2: Update navigation labels**

In `frontend/src/components/Layout/index.tsx`, change visible labels:

```tsx
{ key: '/dashboard', label: '方案工作台' }
{ key: '/customer-projects', label: '客户项目' }
{ key: '/resumes', label: '高级人才能力样本库' }
{ key: '/resumes/upload', label: '导入人才样本' }
{ key: '/industry-agent', label: '业务优化方案智能体' }
{ key: '/ai-employees', label: 'AI 员工' }
```

Update the subtitle to:

```tsx
<span>客户诊断、能力样本、方案文档与 AI 员工任务拆解</span>
```

- [ ] **Step 3: Build customer project list page**

Create `frontend/src/pages/CustomerProjects/List.tsx` with a table, create modal, and `request.post('/customer-projects')`. Minimum page behavior:

```tsx
const fetchProjects = async () => {
  const res = await request.get('/customer-projects');
  setProjects(res as CustomerProject[]);
};

const createProject = async () => {
  const values = await form.validateFields();
  const created = await request.post('/customer-projects', {
    ...values,
    pain_points: splitLines(values.pain_points),
    goals: splitLines(values.goals),
  });
  navigate(`/customer-projects/${(created as CustomerProject).id}`);
};
```

- [ ] **Step 4: Build project detail page**

Create `frontend/src/pages/CustomerProjects/Detail.tsx` with three panels:

- project summary
- task board grouped by stage/status
- solution document editor/export block

Minimum AI run behavior:

```tsx
const runEmployee = async (taskId: string) => {
  const run = await request.post(`/project-tasks/${taskId}/ai-runs`);
  setSelectedRun(run as AIEmployeeRun);
};

const acceptRun = async () => {
  await request.post(`/ai-runs/${selectedRun.id}/accept`);
  message.success('AI 员工输出已验收');
  await fetchProject();
};
```

- [ ] **Step 5: Build AI employee registry**

Create `frontend/src/pages/AIEmployees/List.tsx`:

```tsx
const fetchEmployees = async () => {
  const res = await request.get('/ai-employees');
  setEmployees(res as AIEmployee[]);
};
```

Render employee cards with display name, responsibility, output template, and status.

- [ ] **Step 6: Update copy on existing pages**

Change the page title text:

- Dashboard title from analysis dashboard wording to `方案工作台`.
- Industry agent title from `行业方案智能体` to `业务优化方案智能体`.
- Existing resume library copy from candidate/recruiting wording to talent capability sample wording where visible.

- [ ] **Step 7: Build and commit**

Run:

```bash
npm run build
```

Expected: build passes. Large chunk warnings are acceptable for this task.

Commit:

```bash
git add frontend/src/router/index.tsx frontend/src/components/Layout/index.tsx frontend/src/pages/CustomerProjects/List.tsx frontend/src/pages/CustomerProjects/Detail.tsx frontend/src/pages/AIEmployees/List.tsx frontend/src/pages/Dashboard/index.tsx frontend/src/pages/IndustryAgent/index.tsx frontend/src/index.css
git commit -m "feat: add business workbench frontend"
```

### Task 3: End-To-End Verification

**Files:**
- Modify: none

- [ ] **Step 1: Run backend tests**

Run:

```bash
backend/venv/bin/python -m pytest backend/tests/test_business_workbench_routes.py backend/tests/test_resume_intelligence_service.py -q
```

Expected: pass.

- [ ] **Step 2: Run full frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: pass.

- [ ] **Step 3: Run full backend suite if targeted checks pass**

Run:

```bash
backend/venv/bin/python -m pytest -q
```

Expected: pass. Existing deprecation warnings are acceptable.

- [ ] **Step 4: Commit verification notes only if files changed**

If no files changed, do not commit. If screenshots or docs are intentionally added, stage only those files.

## Self-Review

- Spec coverage: this plan covers customer projects, capability samples, task board, AI employee MVP entry, solution document, navigation, and tests.
- Version 1 scope: autonomous AI employee execution, customer self-service, external tools, and table renames remain out of scope.
- Existing worktree state: current branch has unrelated uncommitted resume-positioning and frontend styling work; implementation steps must stage only files touched by each task.
