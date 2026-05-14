from uuid import uuid4

from app.models.models import Resume, ResumeStatus, ScreeningResult
from app.services import business_workbench_service as workbench_service


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

    tasks_after_accept = client.get(
        f"/api/customer-projects/{project['id']}/tasks",
        headers=admin_auth_headers,
    ).json()
    accepted_task = next(item for item in tasks_after_accept if item["id"] == task_id)
    assert accepted_task["status"] == "done"
    assert accepted_task["output"]["draft"]

    document = client.get(
        f"/api/customer-projects/{project['id']}/solution-document",
        headers=admin_auth_headers,
    ).json()
    assert "验收输出" in document["content"]


def test_ai_employee_registry_includes_actionable_task_counts(client, admin_auth_headers):
    project = client.post(
        "/api/customer-projects",
        headers=admin_auth_headers,
        json={
            "name": "AI员工客户",
            "industry": "企业服务",
            "business_model": "项目制咨询交付",
            "pain_points": ["方案落地慢"],
            "goals": ["建立AI员工交付流程"],
        },
    ).json()
    tasks = client.post(
        f"/api/customer-projects/{project['id']}/tasks/generate",
        headers=admin_auth_headers,
    ).json()
    business_task = next(item for item in tasks if item["ai_employee_type"] == "business_analyst")

    response = client.get("/api/ai-employees", headers=admin_auth_headers)

    assert response.status_code == 200
    employees = {item["employee_type"]: item for item in response.json()}
    analyst = employees["business_analyst"]
    assert analyst["ready_task_count"] >= 1
    assert analyst["next_task_id"] == business_task["id"]
    assert analyst["next_project_id"] == project["id"]
    assert analyst["latest_project_name"] == "AI员工客户"


def test_ai_employee_chat_generates_solution_from_uploaded_context(
    client, admin_auth_headers, db, monkeypatch
):
    resume = Resume(
        id=uuid4(),
        candidate_name="政企产品负责人",
        file_path="uploads/resumes/template-platform.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        parsed_data={
            "industry_label": "政企服务",
            "work_experiences": [
                {
                    "company": "政务数字化公司",
                    "role": "产品负责人",
                    "summary": "负责政企材料模板、资质资料库和自动填报平台。",
                    "capabilities": ["模板字段识别", "资料库治理", "文档自动生成"],
                }
            ],
            "project_experiences": [
                {
                    "name": "政企材料模板自动填报平台",
                    "role": "产品负责人",
                    "problem": "客户需要按官方模板重复填写公司资质和项目信息。",
                    "solution": "沉淀模板库、字段映射和企业资料库，自动生成初稿后人工审核。",
                    "business_model": "项目交付费+年度维护费",
                }
            ],
            "logic_analysis": "先标准化模板字段，再做资料抽取、映射和人工审核闭环。",
        },
    )
    db.add(resume)
    db.commit()

    captured = {}

    def fake_generate_solution_agent_response(payload):
        captured["payload"] = payload
        return {
            "title": "处置方案治理模板自动填报平台",
            "summary": "基于官方模板、企业资料库和字段映射规则生成治理方案初稿。",
            "recommended_solutions": [
                {
                    "name": "模板采集与字段映射系统",
                    "scenario": "收集各区官方模板并映射企业资质、项目基础信息",
                    "value": "减少重复填报和格式错误",
                    "related_cases": ["政企材料模板自动填报平台"],
                    "implementation_steps": ["收集模板", "建立字段字典", "接入资料库", "人工审核导出"],
                }
            ],
            "needed_capabilities": ["模板字段识别", "资料库治理", "文档自动生成"],
            "dynamic_workers": [
                {
                    "name": "模板解析员工",
                    "responsibility": "识别官方模板字段、格式和必填规则",
                    "human_review": "人工确认字段口径和官方解释",
                }
            ],
            "risks": ["官方模板口径需要人工确认"],
            "next_questions": ["客户现有公司资质资料是否结构化？"],
        }

    monkeypatch.setattr(
        workbench_service,
        "generate_solution_agent_response",
        fake_generate_solution_agent_response,
        raising=False,
    )

    response = client.post(
        "/api/ai-employees/chat",
        headers=admin_auth_headers,
        json={
            "requirement": "客户要做处置方案治理方案，官方有模板，需要自动填写公司资质和项目基础信息。",
            "company_profile": "公司具备多项施工和治理资质。",
            "project_materials": "已有项目名称、地址、负责人、治理范围和预算信息。",
            "messages": [
                {"role": "user", "content": "帮我基于历史人才经验设计一个可交付系统。"}
            ],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["model_used"] is True
    assert data["fallback_used"] is False
    assert data["solution"]["title"] == "处置方案治理模板自动填报平台"
    assert "处置方案治理模板自动填报平台" in data["assistant_message"]
    assert data["retrieved_evidence"][0]["project_name"] == "政企材料模板自动填报平台"
    assert data["dynamic_workers"][0]["name"] == "模板解析员工"
    assert "人工确认字段口径和官方解释" in data["human_decision_points"]
    assert captured["payload"]["knowledge_context"]["project_cases"][0]["project_name"] == "政企材料模板自动填报平台"


def test_create_customer_project_from_agent_solution_generates_delivery_assets(
    client, admin_auth_headers
):
    response = client.post(
        "/api/customer-projects/from-agent-solution",
        headers=admin_auth_headers,
        json={
            "industry": "工程建设",
            "business_type": "工程管理",
            "current_process": "项目现场靠人工登记车辆，投标文件靠人工复制模板。",
            "pain_points": ["车辆进出难追踪", "投标文件制作慢"],
            "goals": ["车辆识别管理平台", "投标文件制作平台"],
            "solution": {
                "title": "工程管理智能识别与投标文件平台",
                "summary": "围绕工程现场和投标资料形成AI产品方案。",
                "recommended_solutions": [
                    {
                        "name": "工程车辆识别管理平台",
                        "scenario": "施工现场车辆进出管理",
                        "value": "降低人工登记成本",
                        "implementation_steps": ["梳理车辆出入流程", "接入识别设备", "沉淀异常台账"],
                    },
                    {
                        "name": "投标文件制作平台",
                        "scenario": "投标资料生成与复用",
                        "value": "减少重复制作时间",
                    },
                ],
                "needed_capabilities": ["流程治理", "工程审计"],
                "risks": ["现场数据需要先结构化"],
                "next_questions": ["现有车辆数据在哪里？"],
                "knowledge_context": {"project_count": 2, "candidate_count": 1},
            },
        },
    )

    assert response.status_code == 200
    project = response.json()
    assert project["name"] == "工程管理智能识别与投标文件平台"
    assert project["status"] == "designing"
    assert project["diagnosis"]["next_questions"] == ["现有车辆数据在哪里？"]
    assert "工程车辆识别管理平台" in project["solution_document"]["content"]

    tasks = client.get(
        f"/api/customer-projects/{project['id']}/tasks",
        headers=admin_auth_headers,
    ).json()
    assert len(tasks) >= 6
    assert any(item["ai_employee_type"] == "product_manager" for item in tasks)


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
