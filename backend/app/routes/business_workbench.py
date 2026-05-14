from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.models.models import AIEmployeeRun, User
from app.routes.auth import get_current_user
from app.schemas.business_workbench import (
    AgentSolutionProjectCreate,
    AIEmployeeChatRequest,
    AIEmployeeChatResponse,
    AIEmployeeResponse,
    AIEmployeeRunResponse,
    CapabilitySampleResponse,
    CustomerProjectCreate,
    CustomerProjectResponse,
    CustomerProjectUpdate,
    ProjectTaskResponse,
    ProjectTaskUpdate,
    SolutionDocumentResponse,
    SolutionDocumentUpdate,
)
from app.services import business_workbench_service as service


router = APIRouter(tags=["business-workbench"])


@router.get("/customer-projects", response_model=List[CustomerProjectResponse])
def list_projects_route(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_customer_projects(db)


@router.post("/customer-projects", response_model=CustomerProjectResponse)
def create_project_route(
    payload: CustomerProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_customer_project(db, payload, current_user.id)


@router.post("/customer-projects/from-agent-solution", response_model=CustomerProjectResponse)
def create_project_from_agent_solution_route(
    payload: AgentSolutionProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_customer_project_from_agent_solution(db, payload, current_user.id)


@router.get("/customer-projects/{project_id}", response_model=CustomerProjectResponse)
def get_project_route(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = service.get_customer_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Customer project not found")
    return project


@router.put("/customer-projects/{project_id}", response_model=CustomerProjectResponse)
def update_project_route(
    project_id: UUID,
    payload: CustomerProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = service.update_customer_project(db, project_id, payload)
    if not project:
        raise HTTPException(status_code=404, detail="Customer project not found")
    return project


@router.post("/customer-projects/{project_id}/diagnose", response_model=CustomerProjectResponse)
def diagnose_project_route(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = service.generate_diagnosis(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Customer project not found")
    return project


@router.get("/customer-projects/{project_id}/tasks", response_model=List[ProjectTaskResponse])
def list_tasks_route(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tasks = service.generate_project_tasks(db, project_id)
    if not tasks and not service.get_customer_project(db, project_id):
        raise HTTPException(status_code=404, detail="Customer project not found")
    return tasks


@router.post("/customer-projects/{project_id}/tasks/generate", response_model=List[ProjectTaskResponse])
def generate_tasks_route(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tasks = service.generate_project_tasks(db, project_id)
    if not tasks and not service.get_customer_project(db, project_id):
        raise HTTPException(status_code=404, detail="Customer project not found")
    return tasks


@router.put("/project-tasks/{task_id}", response_model=ProjectTaskResponse)
def update_task_route(
    task_id: UUID,
    payload: ProjectTaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = service.update_project_task(db, task_id, payload)
    if not task:
        raise HTTPException(status_code=404, detail="Project task not found")
    return task


@router.get("/customer-projects/{project_id}/solution-document", response_model=SolutionDocumentResponse)
def get_solution_document_route(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = service.get_solution_document(db, project_id)
    if not document:
        raise HTTPException(status_code=404, detail="Solution document not found")
    return document


@router.put("/customer-projects/{project_id}/solution-document", response_model=SolutionDocumentResponse)
def update_solution_document_route(
    project_id: UUID,
    payload: SolutionDocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = service.update_solution_document(db, project_id, payload.content)
    if not document:
        raise HTTPException(status_code=404, detail="Solution document not found")
    return document


@router.post("/customer-projects/{project_id}/solution-document/export")
def export_solution_document_route(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = service.get_solution_document(db, project_id)
    if not document:
        raise HTTPException(status_code=404, detail="Solution document not found")
    return PlainTextResponse(content=document.content)


@router.get("/capability-samples", response_model=List[CapabilitySampleResponse])
def list_capability_samples_route(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_capability_samples(db)


@router.get("/ai-employees", response_model=List[AIEmployeeResponse])
def list_ai_employees_route(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_ai_employees(db)


@router.post("/ai-employees/chat", response_model=AIEmployeeChatResponse)
def chat_with_ai_employee_route(
    payload: AIEmployeeChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.chat_with_ai_employee(db, payload)


@router.post("/project-tasks/{task_id}/ai-runs", response_model=AIEmployeeRunResponse)
def create_ai_run_route(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = service.create_ai_employee_run(db, task_id)
    if not run:
        raise HTTPException(status_code=404, detail="Project task not found")
    return run


@router.get("/project-tasks/{task_id}/ai-runs", response_model=List[AIEmployeeRunResponse])
def list_ai_runs_route(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(AIEmployeeRun)
        .filter(AIEmployeeRun.task_id == task_id)
        .order_by(AIEmployeeRun.created_at.desc())
        .all()
    )


@router.post("/ai-runs/{run_id}/accept", response_model=AIEmployeeRunResponse)
def accept_ai_run_route(
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = service.accept_ai_employee_run(db, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="AI employee run not found")
    return run


@router.post("/ai-runs/{run_id}/discard", response_model=AIEmployeeRunResponse)
def discard_ai_run_route(
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = service.discard_ai_employee_run(db, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="AI employee run not found")
    return run
