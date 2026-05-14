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
