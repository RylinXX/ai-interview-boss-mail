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


class AgentSolutionProjectCreate(BaseModel):
    industry: Optional[str] = None
    business_type: Optional[str] = None
    current_process: Optional[str] = None
    pain_points: List[str] = []
    goals: List[str] = []
    solution: Dict[str, Any]


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


class SolutionDocumentUpdate(BaseModel):
    content: str


class AIEmployeeResponse(BaseModel):
    employee_type: str
    display_name: str
    responsibility: str
    output_template: str
    status: str = "available"
    ready_task_count: int = 0
    accepted_run_count: int = 0
    next_task_id: Optional[UUID] = None
    next_project_id: Optional[UUID] = None
    latest_project_name: Optional[str] = None


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
