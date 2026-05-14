from uuid import uuid4

from app.models.models import Resume, ResumeStatus, ScreeningResult
from app.services import knowledge_asset_service


def test_manual_intake_creates_reviewable_knowledge_asset(client, admin_auth_headers):
    response = client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "工程招投标平台案例",
            "source_type": "company_case",
            "source_name": "内部访谈",
            "source_url": "https://example.com/bidding",
            "raw_text": "某工程咨询公司通过投标资料模板库、人员资质库和流程审批系统提升投标文件制作效率。",
            "industry_tags": ["工程建设"],
            "business_topic_tags": ["招投标", "人员资质库"],
            "evidence_type_tags": ["真实项目经验"],
            "value_tags": ["验证可行性", "提供系统模块参考"],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "工程招投标平台案例"
    assert data["source_type"] == "company_case"
    assert data["manual_review_status"] == "unreviewed"
    assert "工程建设" in data["industry_tags"]
    assert "招投标" in data["business_topic_tags"]
    assert data["source_url"] == "https://example.com/bidding"
    assert data["confidence_score"] >= 0


def test_review_endpoint_updates_tags_and_evidence(client, admin_auth_headers):
    created = client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "AI影视账号对标",
            "source_type": "manual_note",
            "raw_text": "对标账号每天发布AI影视短片，依靠脚本模板、剪辑工具和账号矩阵形成内容SOP。",
        },
    ).json()

    response = client.put(
        f"/api/knowledge-assets/{created['id']}/review",
        headers=admin_auth_headers,
        json={
            "industry_tags": ["旅游文娱"],
            "business_topic_tags": ["AI影视", "短视频账号运营"],
            "evidence_type_tags": ["竞品案例", "SOP"],
            "value_tags": ["提供运营打法"],
            "proves": ["AI影视账号可以被拆成选题、脚本、制作、发布、复盘流程"],
            "does_not_prove": ["不能证明该打法适合所有影视公司"],
            "applicable_conditions": ["客户具备内容制作人员或外包资源"],
            "migration_risks": ["平台规则和内容审美变化会影响复用效果"],
            "manual_review_status": "reviewed",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["manual_review_status"] == "reviewed"
    assert data["industry_tags"] == ["旅游文娱"]
    assert data["business_topic_tags"] == ["AI影视", "短视频账号运营"]
    assert data["proves"] == ["AI影视账号可以被拆成选题、脚本、制作、发布、复盘流程"]


def test_resume_sync_creates_project_and_work_knowledge_assets(client, admin_auth_headers, db):
    resume = Resume(
        id=uuid4(),
        candidate_name="李工",
        file_path="uploads/resumes/engineering.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        parsed_data={
            "industry_label": "工程建设",
            "work_experiences": [
                {
                    "company": "工程咨询公司",
                    "role": "项目经理",
                    "summary": "负责招投标流程、人员资质库和投标文件审核。",
                    "capabilities": ["招投标", "资质管理"],
                }
            ],
            "project_experiences": [
                {
                    "name": "招投标资料平台",
                    "problem": "投标资料分散，人员资质复用困难。",
                    "solution": "建设模板库、资质库和审批流程。",
                    "business_model": "项目制系统建设",
                    "metrics": ["投标文件制作周期缩短"],
                }
            ],
        },
    )
    db.add(resume)
    db.commit()

    response = client.post(
        f"/api/resumes/{resume.id}/knowledge-assets/sync",
        headers=admin_auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    titles = {item["title"] for item in data["items"]}
    assert "李工 - 工程咨询公司工作经验" in titles
    assert "招投标资料平台" in titles
    project = next(item for item in data["items"] if item["title"] == "招投标资料平台")
    assert project["source_type"] == "resume_project"
    assert "工程建设" in project["industry_tags"]
    assert "招投标" in project["business_topic_tags"]
    assert "真实项目经验" in project["evidence_type_tags"]


def test_resume_sync_is_idempotent(client, admin_auth_headers, db):
    resume = Resume(
        id=uuid4(),
        candidate_name="周运营",
        file_path="uploads/resumes/media.pdf",
        parse_status="success",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
        parsed_data={
            "industry_label": "旅游文娱",
            "project_experiences": [
                {"name": "AI影视账号矩阵", "solution": "建立脚本、剪辑、发布和复盘SOP。"}
            ],
        },
    )
    db.add(resume)
    db.commit()

    client.post(f"/api/resumes/{resume.id}/knowledge-assets/sync", headers=admin_auth_headers)
    second = client.post(f"/api/resumes/{resume.id}/knowledge-assets/sync", headers=admin_auth_headers)

    assert second.status_code == 200
    assert second.json()["total"] == 1


def test_manual_intake_uses_ai_tagging_when_available(client, admin_auth_headers, monkeypatch):
    def fake_generate_knowledge_asset_tags(payload):
        return {
            "summary": "工程招投标资料系统可作为可行性证据。",
            "industry_tags": ["工程建设"],
            "business_topic_tags": ["招投标", "人员资质库"],
            "evidence_type_tags": ["真实项目经验"],
            "value_tags": ["验证可行性"],
            "proves": ["招投标资料和人员资质可以系统化管理"],
            "does_not_prove": ["不能证明当前客户预算充足"],
            "applicable_conditions": ["客户已有投标资料和资质数据"],
            "migration_risks": ["资料口径不统一会影响落地"],
            "score_dimensions": {
                "evidence_strength_score": 82,
                "data_verification_score": 65,
                "commercial_value_score": 76,
                "confidence_score": 74,
            },
            "confidence_reason": "有真实项目描述，但缺少量化指标。",
        }

    monkeypatch.setattr(
        knowledge_asset_service,
        "generate_knowledge_asset_tags",
        fake_generate_knowledge_asset_tags,
    )

    response = client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "招投标资料系统",
            "source_type": "manual_note",
            "raw_text": "客户想把投标资料、人员资质、模板和审批流程做成系统。",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["summary"] == "工程招投标资料系统可作为可行性证据。"
    assert data["proves"] == ["招投标资料和人员资质可以系统化管理"]
    assert data["confidence_score"] == 74


def test_manual_intake_falls_back_when_ai_tagging_returns_empty(client, admin_auth_headers, monkeypatch):
    monkeypatch.setattr(knowledge_asset_service, "generate_knowledge_asset_tags", lambda payload: {})

    response = client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "AI影视SOP",
            "source_type": "manual_note",
            "raw_text": "AI影视账号需要对标账号、脚本模板、剪辑工具、发布节奏和复盘数据。",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "旅游文娱" in data["industry_tags"]
    assert data["manual_review_status"] == "unreviewed"
    assert data["confidence_reason"]


def test_asset_search_matches_demand_terms(client, admin_auth_headers):
    created = client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "招投标资料自动化",
            "source_type": "company_case",
            "raw_text": "工程咨询公司把投标模板、人员资质和审批流程做成招投标资料平台。",
            "industry_tags": ["工程建设"],
            "business_topic_tags": ["招投标"],
            "evidence_type_tags": ["真实项目经验"],
            "value_tags": ["验证可行性"],
        },
    ).json()

    response = client.post(
        "/api/knowledge-assets/search",
        headers=admin_auth_headers,
        json={"query": "我们想做招投标相关优化", "limit": 5},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["items"][0]["asset"]["id"] == created["id"]
    assert data["items"][0]["match_score"] > 0
    assert "招投标" in data["items"][0]["match_reason"]


def test_ai_product_manager_draft_uses_cited_assets(client, admin_auth_headers, monkeypatch):
    monkeypatch.setattr(knowledge_asset_service, "generate_ai_product_manager_draft", lambda payload: {})
    client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "工程招投标资料平台",
            "source_type": "company_case",
            "raw_text": "已有工程咨询公司通过投标模板库和人员资质库提升投标资料制作效率。",
            "industry_tags": ["工程建设"],
            "business_topic_tags": ["招投标", "人员资质库"],
            "evidence_type_tags": ["真实项目经验"],
            "value_tags": ["验证可行性", "提供系统模块参考"],
        },
    )

    response = client.post(
        "/api/ai-product-manager/draft",
        headers=admin_auth_headers,
        json={
            "demand": "我们公司需要招投标相关优化",
            "company_profile": "工程咨询公司，已有投标资料和人员资质数据。",
            "limit": 5,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "招投标" in data["demand_understanding"]
    assert data["cited_assets"]
    assert data["solution_hypotheses"]
    assert data["missing_questions"]
    assert data["human_confirmation_points"]
    assert data["fallback_used"] is True
