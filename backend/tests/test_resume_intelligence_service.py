from datetime import datetime, timedelta
from uuid import uuid4

from app.models.models import Resume, ResumeStatus, ScreeningResult
from app.services import resume_service
from app.utils.prompt_manager import prompt_manager


def test_prompt_manager_exposes_resume_positioning_prompt_when_db_prompts_are_old(monkeypatch):
    monkeypatch.setattr(
        prompt_manager,
        "_db_prompts",
        {"analyze_resume_intelligence": {"system": "custom system", "user": "custom user"}},
    )

    prompts = prompt_manager.get_all_prompts()

    assert "analyze_resume_positioning" in prompts
    assert prompts["analyze_resume_positioning"]["user"]


def test_upload_resume_route_accepts_pdf_without_position(client, db, monkeypatch):
    queued = []

    monkeypatch.setattr(
        resume_service,
        "process_resume_background",
        lambda resume_id, position_id, use_user_info=False: queued.append(
            (resume_id, position_id, use_user_info)
        ),
    )

    response = client.post(
        "/api/resumes",
        files={"file": ("candidate.pdf", b"%PDF-1.4", "application/pdf")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["position_id"] is None
    assert data["parse_status"] == "processing"
    assert len(queued) == 1
    assert queued[0][1] is None


def test_resume_experience_summary_route_returns_collected_experiences(
    client, admin_auth_headers, db
):
    resume = Resume(
        id=uuid4(),
        candidate_name="林青",
        position_id=None,
        file_path="uploads/resumes/candidate.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        parsed_data={
            "work_experiences": [{"company": "A 公司", "role": "产品负责人"}],
            "project_experiences": [{"name": "AI 质检平台"}],
            "logic_analysis": "商业化导向",
        },
    )
    db.add(resume)
    db.commit()
    resume_id = resume.id

    response = client.get("/api/resumes/experience-summary", headers=admin_auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["resume_count"] == 1
    assert data["work_experiences"][0]["company"] == "A 公司"
    assert data["work_experiences"][0]["industry_label"] == "计算机/AI"
    assert data["project_experiences"][0]["name"] == "AI 质检平台"
    assert data["project_experiences"][0]["industry_label"] == "计算机/AI"
    assert data["logic_analyses"][0]["industry_label"] == "计算机/AI"
    assert data["industry_summary"][0]["industry_label"] == "计算机/AI"
    assert data["industry_summary"][0]["resume_count"] == 1
    assert data["industry_summary"][0]["project_count"] == 1
    assert data["industry_summary"][0]["work_count"] == 1


def test_resume_project_library_route_flattens_projects_and_filters_missing(
    client, admin_auth_headers, db
):
    first = Resume(
        id=uuid4(),
        candidate_name="林青",
        position_id=None,
        file_path="uploads/resumes/lin.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        match_score=86,
        created_at=datetime.utcnow() - timedelta(minutes=1),
        parsed_data={
            "project_experiences": [
                {
                    "name": "AI 质检平台",
                    "role": "产品负责人",
                    "business_model": "按产线订阅收费",
                    "missing_evidence": ["续费率"],
                },
                {
                    "name": "知识库迁移工具",
                    "role": "项目负责人",
                    "business_model": "内部提效工具",
                    "missing_evidence": [],
                },
            ],
            "startup_landing_ideas": ["面向工厂推出质检 SaaS"],
        },
    )
    second = Resume(
        id=uuid4(),
        candidate_name="周远",
        position_id=None,
        file_path="uploads/resumes/zhou.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        match_score=78,
        created_at=datetime.utcnow(),
        parsed_data={
            "project_experiences": [
                {
                    "name": "私域增长系统",
                    "role": "增长负责人",
                    "business_model": "",
                    "missing_evidence": ["获客成本", "转化率"],
                }
            ],
            "startup_landing_ideas": ["面向本地生活商户做增长工具"],
        },
    )
    db.add_all([first, second])
    db.commit()

    response = client.get("/api/resumes/project-library", headers=admin_auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["project_count"] == 3
    assert data["projects"][0]["candidate_name"] == "周远"
    assert data["projects"][0]["name"] == "私域增长系统"
    assert data["projects"][0]["industry_label"] == "零售电商"
    assert data["projects"][0]["resume_score"] == 78
    assert data["projects"][0]["landing_ideas"] == ["面向本地生活商户做增长工具"]
    assert {item["industry_label"] for item in data["industry_summary"]} == {"计算机/AI", "零售电商"}

    missing_response = client.get(
        "/api/resumes/project-library",
        headers=admin_auth_headers,
        params={"missing_only": True},
    )

    assert missing_response.status_code == 200
    missing_data = missing_response.json()
    assert missing_data["project_count"] == 2
    assert {item["name"] for item in missing_data["projects"]} == {"AI 质检平台", "私域增长系统"}


def test_resume_experience_summary_groups_big_industry_tags(db):
    finance = Resume(
        id=uuid4(),
        candidate_name="周金",
        position_id=None,
        file_path="uploads/resumes/finance.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        parsed_data={
            "work_experiences": [
                {
                    "company": "银行科技公司",
                    "role": "产品经理",
                    "summary": "负责信贷流程优化、风控合规和银行渠道转化。",
                }
            ],
            "project_experiences": [
                {
                    "name": "信贷风控平台",
                    "role": "产品经理",
                    "problem": "贷款审批链路长，风控口径不统一。",
                }
            ],
            "logic_analysis": "围绕合规、风险和转化率做产品闭环。",
        },
    )
    tourism = Resume(
        id=uuid4(),
        candidate_name="宋旅",
        position_id=None,
        file_path="uploads/resumes/tourism.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        parsed_data={
            "work_experiences": [
                {
                    "company": "文旅集团",
                    "role": "运营负责人",
                    "summary": "负责景区票务、酒店套餐和游客服务流程。",
                }
            ],
            "project_experiences": [
                {
                    "name": "景区会员运营平台",
                    "role": "项目负责人",
                    "solution": "整合票务、酒店和旅行社渠道做会员运营。",
                }
            ],
            "logic_analysis": "围绕游客转化和复购设计文旅服务链路。",
        },
    )
    db.add_all([finance, tourism])
    db.commit()

    summary = resume_service.summarize_resume_experiences(db)

    industry_map = {item["industry_label"]: item for item in summary["industry_summary"]}
    assert industry_map["金融行业"]["resume_count"] == 1
    assert industry_map["金融行业"]["company_count"] == 1
    assert industry_map["旅游文娱"]["project_count"] == 1
    assert industry_map["旅游文娱"]["work_count"] == 1
    assert {item["industry_label"] for item in summary["logic_analyses"]} == {"金融行业", "旅游文娱"}


def test_dashboard_summaries_prefer_structured_llm_industry_tags(db):
    resume = Resume(
        id=uuid4(),
        candidate_name="林青",
        position_id=None,
        file_path="uploads/resumes/positioning.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        parsed_data={
            "industry_key": "general",
            "industry_label": "通用业务",
            "industry_color": "default",
            "work_experiences": [
                {
                    "company": "AI SaaS 公司",
                    "role": "产品负责人",
                    "summary": "负责大模型平台、AI 质检和自动化系统交付。",
                    "industry_key": "general",
                    "industry_label": "通用业务",
                    "industry_color": "default",
                }
            ],
            "project_experiences": [
                {
                    "name": "AI 质检平台",
                    "role": "项目负责人",
                    "problem": "质检流程依赖人工。",
                    "solution": "用 AI 平台做自动化质检。",
                    "business_model": "项目交付",
                    "industry_key": "general",
                    "industry_label": "通用业务",
                    "industry_color": "default",
                }
            ],
            "logic_analysis": "围绕 AI 平台和系统交付做流程优化。",
        },
    )
    db.add(resume)
    db.commit()

    summary = resume_service.summarize_resume_experiences(db)
    project_library = resume_service.summarize_resume_projects(db)

    assert summary["work_experiences"][0]["industry_label"] == "通用业务"
    assert summary["project_experiences"][0]["industry_label"] == "通用业务"
    assert summary["logic_analyses"][0]["industry_label"] == "通用业务"
    assert summary["industry_summary"][0]["industry_label"] == "通用业务"
    assert project_library["projects"][0]["industry_label"] == "通用业务"
    assert project_library["industry_summary"][0]["industry_label"] == "通用业务"


def test_resume_queue_stats_route_returns_task_queue_metrics(
    client, admin_auth_headers, monkeypatch
):
    class FakeQueue:
        def get_stats(self):
            return {
                "queue_size": 4,
                "running_tasks": 2,
                "completed_tasks": 11,
                "max_concurrent": 3,
                "total_submitted": 20,
                "total_completed": 11,
                "total_failed": 1,
            }

    monkeypatch.setattr("app.routes.resumes.get_task_queue", lambda: FakeQueue())

    response = client.get("/api/resumes/queue-stats", headers=admin_auth_headers)

    assert response.status_code == 200
    assert response.json() == {
        "queue_size": 4,
        "running_tasks": 2,
        "completed_tasks": 11,
        "max_concurrent": 3,
        "total_submitted": 20,
        "total_completed": 11,
        "total_failed": 1,
    }


def test_industry_solution_agent_groups_cases_by_industry(client, admin_auth_headers, db):
    engineering = Resume(
        id=uuid4(),
        candidate_name="李工",
        position_id=None,
        file_path="uploads/resumes/engineering.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        parsed_data={
            "work_experiences": [
                {
                    "company": "工程造价咨询公司",
                    "role": "项目经理",
                    "summary": "负责工程结算审计、维保流程标准化和成本风险预警。",
                    "capabilities": ["工程审计", "流程治理"],
                }
            ],
            "project_experiences": [
                {
                    "name": "工程结算审计平台",
                    "role": "负责人",
                    "problem": "工程结算资料不全、造价核算不准确。",
                    "solution": "搭建结算审计SOP和风险预警看板。",
                    "business_model": "项目制咨询费+年度服务费",
                    "missing_evidence": ["核减金额", "客户续费率"],
                }
            ],
            "logic_analysis": "先做流程标准化，再用数据预警降低成本。",
            "startup_landing_ideas": ["面向工程企业提供AI审计和维保运营方案"],
        },
    )
    finance = Resume(
        id=uuid4(),
        candidate_name="周金",
        position_id=None,
        file_path="uploads/resumes/finance.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        parsed_data={
            "work_experiences": [
                {
                    "company": "银行科技公司",
                    "role": "产品经理",
                    "summary": "负责信贷产品流程优化和风控合规。",
                    "capabilities": ["金融产品", "风控合规"],
                }
            ],
            "project_experiences": [
                {
                    "name": "信贷流程优化系统",
                    "role": "产品经理",
                    "problem": "银行贷款审批链路长，转化率低。",
                    "solution": "优化授信流程，建立风险分层和渠道转化看板。",
                    "business_model": "金融机构项目交付",
                }
            ],
            "logic_analysis": "围绕合规、转化和风险做产品闭环。",
        },
    )
    db.add_all([engineering, finance])
    db.commit()

    response = client.get("/api/resumes/industry-agent", headers=admin_auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["resume_count"] == 2
    industries = {item["key"]: item for item in data["industries"]}
    assert "engineering" in industries
    assert "finance" in industries
    assert industries["engineering"]["project_count"] == 1
    assert industries["engineering"]["project_cases"][0]["project_name"] == "工程结算审计平台"
    assert industries["engineering"]["candidate_pool"][0]["candidate_name"] == "李工"
    assert "工程" in industries["engineering"]["offer_template"]
    assert industries["finance"]["project_cases"][0]["candidate_name"] == "周金"


def test_generate_industry_agent_solution_uses_resume_context(
    client, admin_auth_headers, db, monkeypatch
):
    resume = Resume(
        id=uuid4(),
        candidate_name="李工",
        position_id=None,
        file_path="uploads/resumes/engineering.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        parsed_data={
            "work_experiences": [
                {
                    "company": "工程造价咨询公司",
                    "role": "项目经理",
                    "summary": "负责工程结算审计、施工资料流转和成本风险预警。",
                    "capabilities": ["工程审计", "流程治理"],
                }
            ],
            "project_experiences": [
                {
                    "name": "工程结算审计平台",
                    "role": "负责人",
                    "problem": "工程结算资料不全、造价核算不准确。",
                    "solution": "搭建结算审计SOP和风险预警看板。",
                    "business_model": "项目制咨询费+年度服务费",
                }
            ],
            "logic_analysis": "先做流程标准化，再用数据预警降低成本。",
            "startup_landing_ideas": ["面向工程企业提供AI审计和维保运营方案"],
        },
    )
    db.add(resume)
    db.commit()

    captured = {}

    def fake_generate_solution_agent_response(payload):
        captured["payload"] = payload
        return {
            "title": "工程管理智能识别与投标文件平台",
            "summary": "围绕工程项目资料、车辆出入和投标文件生成做一体化方案。",
            "recommended_solutions": [
                {
                    "name": "工程车辆识别管理平台",
                    "scenario": "施工现场车辆进出、材料运输和维保记录管理",
                    "value": "降低人工登记成本并形成项目过程数据",
                    "related_cases": ["工程结算审计平台"],
                }
            ],
            "needed_capabilities": ["工程审计", "流程治理"],
            "next_questions": ["现有车辆和材料数据在哪里沉淀？"],
        }

    monkeypatch.setattr(
        resume_service,
        "generate_solution_agent_response",
        fake_generate_solution_agent_response,
    )

    response = client.post(
        "/api/resumes/industry-agent/solution",
        headers=admin_auth_headers,
        json={
            "industry": "工程建设",
            "business_type": "工程管理",
            "current_process": "项目现场靠人工登记车辆和材料，投标文件靠人工复制模板。",
            "pain_points": ["车辆进出难追踪", "招投标文件制作慢"],
            "goals": ["做车辆识别管理平台", "做投标文件制作平台"],
            "conversation": [
                {"role": "user", "content": "我们是工程管理公司，想找可落地的AI方向。"}
            ],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "工程管理智能识别与投标文件平台"
    assert data["recommended_solutions"][0]["name"] == "工程车辆识别管理平台"
    assert data["knowledge_context"]["project_count"] == 1
    assert data["knowledge_context"]["work_count"] == 1
    assert data["knowledge_context"]["candidate_count"] == 1
    assert "工程结算审计平台" in captured["payload"]["project_cases"][0]["project_name"]
    assert captured["payload"]["user_profile"]["business_type"] == "工程管理"


def test_generate_industry_agent_solution_falls_back_without_llm(
    client, admin_auth_headers, db, monkeypatch
):
    resume = Resume(
        id=uuid4(),
        candidate_name="周金",
        position_id=None,
        file_path="uploads/resumes/finance.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        parsed_data={
            "work_experiences": [
                {
                    "company": "银行科技公司",
                    "role": "产品经理",
                    "summary": "负责信贷审批、风控合规和渠道转化。",
                    "capabilities": ["风控合规", "流程优化"],
                }
            ],
            "project_experiences": [
                {
                    "name": "信贷流程优化系统",
                    "problem": "银行贷款审批链路长。",
                    "solution": "建立风险分层和渠道转化看板。",
                    "business_model": "金融机构项目交付",
                }
            ],
            "logic_analysis": "围绕合规、转化和风险做产品闭环。",
        },
    )
    db.add(resume)
    db.commit()

    monkeypatch.setattr(resume_service, "generate_solution_agent_response", lambda payload: {})

    response = client.post(
        "/api/resumes/industry-agent/solution",
        headers=admin_auth_headers,
        json={
            "industry": "金融行业",
            "business_type": "银行服务",
            "current_process": "线下审批多，客户转化慢。",
            "pain_points": ["审批慢", "风险口径不统一"],
            "goals": ["优化信贷审批"],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "银行服务" in data["title"]
    assert data["recommended_solutions"]
    assert data["recommended_solutions"][0]["related_cases"] == ["信贷流程优化系统"]
    assert data["next_questions"]


def test_industry_agent_solution_draft_persists_latest_result(
    client, admin_auth_headers, db, monkeypatch
):
    resume = Resume(
        id=uuid4(),
        candidate_name="刘产品",
        position_id=None,
        file_path="uploads/resumes/software.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        parsed_data={
            "project_experiences": [
                {
                    "name": "投标文件制作平台",
                    "problem": "投标文件靠人工复制模板。",
                    "solution": "沉淀模板、人员资质和项目业绩，自动生成初稿。",
                    "business_model": "软件项目交付",
                }
            ],
            "work_experiences": [
                {
                    "company": "软件交付公司",
                    "role": "产品经理",
                    "summary": "负责系统平台、AI Agent和数据运营。",
                    "capabilities": ["PRD", "项目交付", "数据运营"],
                }
            ],
        },
    )
    db.add(resume)
    db.commit()

    monkeypatch.setattr(
        resume_service,
        "generate_solution_agent_response",
        lambda payload: {
            "title": "招投标文件制作平台方案",
            "summary": "把模板、资质和项目业绩沉淀成可复用资料库。",
            "recommended_solutions": [
                {
                    "name": "投标文件制作平台",
                    "scenario": "招投标文件初稿生成",
                    "value": "减少人工复制模板",
                    "related_cases": ["投标文件制作平台"],
                }
            ],
            "needed_capabilities": ["PRD", "项目交付"],
            "risks": ["资料口径需要人工复核"],
            "next_questions": ["现有模板是否结构化？"],
        },
    )

    created = client.post(
        "/api/resumes/industry-agent/solution-drafts",
        headers=admin_auth_headers,
        json={
            "industry": "软件/AI/系统交付",
            "business_type": "工程管理",
            "current_process": "投标文件靠人工复制模板。",
            "pain_points": ["招投标文件制作慢"],
            "goals": ["投标文件制作平台"],
        },
    )

    assert created.status_code == 200
    draft_id = created.json()["id"]

    latest = client.get(
        "/api/resumes/industry-agent/solution-drafts/latest",
        headers=admin_auth_headers,
    )

    assert latest.status_code == 200
    data = latest.json()
    assert data["id"] == draft_id
    assert data["status"] == "completed"
    assert data["request_payload"]["business_type"] == "工程管理"
    assert data["result"]["title"] == "招投标文件制作平台方案"
    assert data["result"]["knowledge_context"]["project_count"] == 1


def test_process_resume_task_analyzes_resume_without_position(db, monkeypatch):
    resume = Resume(
        id=uuid4(),
        candidate_name="解析中...",
        position_id=None,
        file_path="uploads/resumes/candidate.pdf",
        parse_status="processing",
        status=ResumeStatus.PENDING_SCREENING,
        screening_result=ScreeningResult.PENDING,
    )
    db.add(resume)
    db.commit()
    resume_id = resume.id

    parsed = {
        "candidate_name": "林青",
        "contact": "13800138000",
        "email": "linqing@example.com",
        "years_of_experience": 8,
        "recent_company": "某智能制造公司",
        "evaluation_score": 86,
        "experience_summary": "8 年产品和商业化经验，主导过从 0 到 1 的行业解决方案。",
        "work_experiences": [
            {
                "company": "某智能制造公司",
                "role": "产品负责人",
                "summary": "负责 AI 质检产品商业化。",
            }
        ],
        "project_experiences": [
            {
                "name": "AI 质检平台",
                "business_model": "按产线订阅和项目交付收费。",
                "logic_signals": ["能把算法能力包装成生产指标"],
            }
        ],
        "interview_questions": [
            {"question": "你如何证明 AI 质检平台的 ROI？", "purpose": "验证商业闭环"}
        ],
        "business_model_questions": [
            {"question": "订阅费和项目交付费如何拆分？", "purpose": "补齐收入模型"}
        ],
        "logic_analysis": "候选人倾向先找高频业务痛点，再抽象为产品能力。",
        "project_evaluation": {
            "summary": "项目具备行业落地价值，但依赖交付质量。",
            "risks": ["数据接入周期不稳定"],
            "opportunities": ["可沉淀行业模板"],
        },
        "company_optimization_ideas": ["把交付过程产品化，降低边际成本。"],
        "startup_landing_ideas": ["从单一高价值场景切入，先做行业标杆。"],
    }

    monkeypatch.setattr(resume_service, "SessionLocal", lambda: db)
    monkeypatch.setattr(resume_service, "read_file_content", lambda file_path: "简历原文")
    monkeypatch.setattr(resume_service, "analyze_resume_intelligence", lambda content: parsed)
    monkeypatch.setattr(resume_service, "analyze_resume_positioning", lambda content, parsed_data: {}, raising=False)
    monkeypatch.setattr(resume_service, "generate_resume_markdown", lambda content: "## 林青")

    resume_service.process_resume_task({"resume_id": resume_id, "position_id": None})

    resume = db.query(Resume).filter(Resume.id == resume_id).one()
    assert resume.position_id is None
    assert resume.parse_status == "success"
    assert resume.status == ResumeStatus.COMPLETED
    assert resume.screening_result == ScreeningResult.PASSED
    assert resume.candidate_name == "林青"
    assert resume.email == "linqing@example.com"
    assert resume.match_score == 86
    assert resume.ai_review.startswith("### 经历概要")
    assert resume.resume_markdown == "## 林青"
    assert resume.parsed_data["project_experiences"][0]["name"] == "AI 质检平台"


def test_process_resume_task_merges_llm_positioning_into_parsed_data(db, monkeypatch):
    resume = Resume(
        id=uuid4(),
        candidate_name="解析中...",
        position_id=None,
        file_path="uploads/resumes/candidate.txt",
        parse_status="processing",
        status=ResumeStatus.PENDING_SCREENING,
        screening_result=ScreeningResult.PENDING,
    )
    db.add(resume)
    db.commit()
    resume_id = resume.id

    parsed = {
        "candidate_name": "林青",
        "email": "linqing@example.com",
        "evaluation_score": 86,
        "experience_summary": "负责 AI 质检和银行风控项目。",
        "work_experiences": [
            {
                "company": "银行科技公司",
                "role": "产品负责人",
                "summary": "负责信贷风控平台和渠道转化。",
            }
        ],
        "project_experiences": [
            {
                "name": "AI 质检平台",
                "business_model": "按产线订阅和项目交付收费。",
            }
        ],
        "logic_analysis": "候选人能把行业问题拆成平台能力。",
    }
    positioning = {
        "industry_key": "computer_ai",
        "industry_label": "计算机/AI",
        "industry_color": "blue",
        "positioning_summary": "候选人整体更偏 AI 产品化和系统交付。",
        "work_experiences": [
            {
                "index": 0,
                "industry_key": "finance",
                "industry_label": "金融行业",
                "industry_color": "gold",
                "positioning_summary": "这段公司经历主要沉淀金融风控和渠道转化能力。",
            }
        ],
        "project_experiences": [
            {
                "index": 0,
                "industry_key": "computer_ai",
                "industry_label": "计算机/AI",
                "industry_color": "blue",
                "positioning_summary": "该项目核心定位是 AI 质检平台产品化。",
            }
        ],
        "logic_analysis": {
            "industry_key": "computer_ai",
            "industry_label": "计算机/AI",
            "industry_color": "blue",
            "positioning_summary": "底层逻辑偏平台化和产品化。",
        },
    }

    monkeypatch.setattr(resume_service, "SessionLocal", lambda: db)
    monkeypatch.setattr(resume_service, "read_file_content", lambda file_path: "简历原文")
    monkeypatch.setattr(resume_service, "analyze_resume_intelligence", lambda content: parsed)
    monkeypatch.setattr(resume_service, "analyze_resume_positioning", lambda content, parsed_data: positioning, raising=False)
    monkeypatch.setattr(resume_service, "generate_resume_markdown", lambda content: "## 林青")

    resume_service.process_resume_task({"resume_id": resume_id, "position_id": None})

    resume = db.query(Resume).filter(Resume.id == resume_id).one()
    assert resume.parse_status == "success"
    assert resume.parsed_data["industry_key"] == "computer_ai"
    assert resume.parsed_data["industry_label"] == "计算机/AI"
    assert resume.parsed_data["positioning_summary"] == "候选人整体更偏 AI 产品化和系统交付。"
    assert resume.parsed_data["work_experiences"][0]["industry_label"] == "金融行业"
    assert resume.parsed_data["work_experiences"][0]["positioning_summary"] == "这段公司经历主要沉淀金融风控和渠道转化能力。"
    assert resume.parsed_data["project_experiences"][0]["industry_label"] == "计算机/AI"
    assert resume.parsed_data["logic_industry_label"] == "计算机/AI"
    assert "定位分析" in resume.ai_review


def test_process_resume_task_prefers_direct_pdf_intelligence(db, monkeypatch, tmp_path):
    pdf_path = tmp_path / "candidate.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")
    resume = Resume(
        id=uuid4(),
        candidate_name="解析中...",
        position_id=None,
        file_path=str(pdf_path),
        parse_status="processing",
        status=ResumeStatus.PENDING_SCREENING,
        screening_result=ScreeningResult.PENDING,
    )
    db.add(resume)
    db.commit()
    resume_id = resume.id

    parsed = {
        "raw_text": "模型直读出的简历正文",
        "candidate_name": "林青",
        "email": "linqing@example.com",
        "evaluation_score": 88,
        "experience_summary": "直传 PDF 完成结构化分析。",
        "project_experiences": [{"name": "AI 质检平台"}],
    }

    monkeypatch.setattr(resume_service, "SessionLocal", lambda: db)
    monkeypatch.setattr(
        resume_service,
        "analyze_resume_intelligence_from_document",
        lambda file_path: parsed,
    )
    monkeypatch.setattr(
        resume_service,
        "read_file_content",
        lambda file_path: (_ for _ in ()).throw(AssertionError("local PDF extraction should not run")),
    )
    monkeypatch.setattr(
        resume_service,
        "analyze_resume_intelligence",
        lambda content: (_ for _ in ()).throw(AssertionError("text analysis fallback should not run")),
    )
    monkeypatch.setattr(resume_service, "analyze_resume_positioning", lambda content, parsed_data: {}, raising=False)
    monkeypatch.setattr(resume_service, "generate_resume_markdown", lambda content: "## 林青")

    resume_service.process_resume_task({"resume_id": resume_id, "position_id": None})

    resume = db.query(Resume).filter(Resume.id == resume_id).one()
    assert resume.parse_status == "success"
    assert resume.raw_text == "模型直读出的简历正文"
    assert resume.candidate_name == "林青"
    assert resume.match_score == 88
    assert resume.resume_markdown == "## 林青"


def test_summarize_resume_experiences_collects_work_and_project_items(db):
    first = Resume(
        id=uuid4(),
        candidate_name="林青",
        position_id=None,
        file_path="uploads/resumes/one.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        created_at=datetime.utcnow() - timedelta(minutes=1),
        parsed_data={
            "work_experiences": [{"company": "A 公司", "role": "产品负责人"}],
            "project_experiences": [{"name": "AI 质检平台"}],
            "logic_analysis": "商业化导向",
        },
    )
    second = Resume(
        id=uuid4(),
        candidate_name="周远",
        position_id=None,
        file_path="uploads/resumes/two.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        created_at=datetime.utcnow(),
        parsed_data={
            "work_experiences": [{"company": "B 公司", "role": "增长负责人"}],
            "project_experiences": [{"name": "私域增长系统"}],
            "logic_analysis": "流量效率导向",
        },
    )
    db.add_all([first, second])
    db.commit()

    summary = resume_service.summarize_resume_experiences(db)

    assert summary["resume_count"] == 2
    assert [item["candidate_name"] for item in summary["work_experiences"]] == ["周远", "林青"]
    assert {item["name"] for item in summary["project_experiences"]} == {"AI 质检平台", "私域增长系统"}
    assert summary["logic_analyses"][0]["analysis"] == "流量效率导向"
