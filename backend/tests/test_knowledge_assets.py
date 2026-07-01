from uuid import uuid4
from datetime import datetime, timedelta

from app.models.models import KnowledgeAsset, Resume, ResumeStatus, ScreeningResult
from app.services import knowledge_asset_service


def test_list_knowledge_assets_returns_all_requested_assets_and_filters_before_limit(
    client, admin_auth_headers, db
):
    base_time = datetime(2026, 1, 1, 0, 0, 0)
    target = KnowledgeAsset(
        title="Target industry evidence",
        source_type="resume_project",
        raw_text="target evidence",
        industry_tags=["target-industry"],
        business_topic_tags=["target-topic"],
        evidence_type_tags=["target-evidence"],
        created_at=base_time,
        updated_at=base_time,
    )
    db.add(target)
    for index in range(520):
        created_at = base_time + timedelta(minutes=index + 1)
        db.add(
            KnowledgeAsset(
                title=f"Other evidence {index}",
                source_type="resume_project",
                raw_text="other evidence",
                industry_tags=["other-industry"],
                business_topic_tags=["other-topic"],
                evidence_type_tags=["other-evidence"],
                created_at=created_at,
                updated_at=created_at,
            )
        )
    db.commit()

    all_response = client.get(
        "/api/knowledge-assets",
        headers=admin_auth_headers,
        params={"limit": 100000},
    )
    filtered_response = client.get(
        "/api/knowledge-assets",
        headers=admin_auth_headers,
        params={"industry": "target-industry", "limit": 100000},
    )

    assert all_response.status_code == 200
    assert all_response.json()["total"] == 521
    assert filtered_response.status_code == 200
    filtered = filtered_response.json()
    assert filtered["total"] == 1
    assert filtered["items"][0]["id"] == str(target.id)


def test_upload_knowledge_asset_file_returns_chunk_provenance(
    client, admin_auth_headers, monkeypatch
):
    monkeypatch.setattr(knowledge_asset_service, "generate_knowledge_asset_tags", lambda payload: {})
    body = "\n".join(
        [
            f"section {idx} proposal template qualification workflow approval automation"
            for idx in range(220)
        ]
    )

    response = client.post(
        "/api/knowledge-assets/upload",
        headers=admin_auth_headers,
        data={
            "title": "Proposal Operations Manual",
            "source_type": "official_document",
            "source_name": "Operations Playbook",
            "source_confidentiality": "internal",
        },
        files={"file": ("proposal-ops.md", body.encode("utf-8"), "text/markdown")},
    )

    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) >= 2
    document_ids = {item["source_document_id"] for item in items}
    assert len(document_ids) == 1
    assert [item["chunk_index"] for item in items] == list(range(len(items)))
    assert all(item["chunk_total"] == len(items) for item in items)
    assert all(item["citation_id"] for item in items)
    assert all("chunk" in item["source_locator"] for item in items)
    assert all(item["source_excerpt"] for item in items)


def test_solution_agent_returns_source_payloads_and_retrieval_log(
    client, admin_auth_headers, monkeypatch
):
    created = client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "Proposal Automation Case",
            "source_type": "company_case",
            "source_name": "Internal Case Library",
            "raw_text": "proposal template qualification workflow approval automation reduces repeated document work",
            "business_topic_tags": ["proposal"],
            "evidence_type_tags": ["case"],
            "proves": ["proposal document workflows can be automated with approval controls"],
        },
    ).json()

    monkeypatch.setattr(
        knowledge_asset_service,
        "generate_solution_agent_response",
        lambda payload: {
            "title": "Proposal Automation Plan",
            "summary": "Use cited evidence to automate proposal document workflows.",
            "recommended_solutions": [],
            "needed_capabilities": [],
            "dynamic_workers": [],
            "risks": [],
            "next_questions": [],
        },
        raising=False,
    )

    response = client.post(
        "/api/solution-agent/generate",
        headers=admin_auth_headers,
        json={"requirement": "proposal automation workflow", "limit": 3},
    )

    assert response.status_code == 200
    data = response.json()
    evidence = data["retrieved_evidence"][0]
    assert evidence["id"] == created["id"]
    assert evidence["citation_id"]
    assert evidence["source_payload"]["citation_id"] == evidence["citation_id"]
    assert evidence["source_payload"]["source_name"] == "Internal Case Library"
    assert evidence["source_payload"]["chunk_index"] == 0
    assert evidence["source_payload"]["excerpt"]
    assert data["retrieval_log"]["original_query"] == "proposal automation workflow"
    assert data["retrieval_log"]["returned_count"] >= 1
    assert data["retrieval_log"]["results"][0]["asset_id"] == created["id"]


def test_search_assets_records_hybrid_retrieval_pipeline(
    client, admin_auth_headers, monkeypatch
):
    monkeypatch.setattr(knowledge_asset_service, "generate_knowledge_asset_tags", lambda payload: {})
    client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "Proposal Workflow Automation",
            "source_type": "company_case",
            "raw_text": "proposal approval workflow automation template qualification document generation",
            "business_topic_tags": ["proposal", "workflow"],
            "evidence_type_tags": ["case"],
        },
    )
    client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "Social Content Calendar",
            "source_type": "manual_note",
            "raw_text": "marketing calendar social media captions publishing cadence",
            "business_topic_tags": ["marketing"],
        },
    )

    response = client.post(
        "/api/knowledge-assets/search",
        headers=admin_auth_headers,
        json={"query": "proposal workflow automation", "limit": 5},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["items"][0]["asset"]["title"] == "Proposal Workflow Automation"
    assert data["retrieval_log"]["retrieval_mode"] == "hybrid_keyword_bm25_semantic"
    assert "knowledge_asset_bm25_search" in data["retrieval_log"]["selected_tools"]
    assert "knowledge_asset_semantic_vector_search" in data["retrieval_log"]["selected_tools"]
    assert "rrf_fusion" in data["retrieval_log"]["selected_tools"]
    assert data["retrieval_log"]["route_counts"]["keyword_tag"] >= 1
    assert data["retrieval_log"]["route_counts"]["bm25_text"] >= 1
    assert data["retrieval_log"]["route_counts"]["semantic_vector"] >= 1
    first = data["retrieval_log"]["results"][0]
    assert first["route_scores"]["bm25_text"] > 0
    assert first["route_scores"]["semantic_vector"] > 0
    assert first["rrf_score"] > 0
    assert first["rerank_score"] > 0


def test_solution_agent_payload_uses_compressed_evidence_context(
    client, admin_auth_headers, monkeypatch
):
    monkeypatch.setattr(knowledge_asset_service, "generate_knowledge_asset_tags", lambda payload: {})
    long_text = " ".join(["proposal workflow automation approval qualification template"] * 240)
    client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "Proposal Automation Evidence",
            "source_type": "company_case",
            "raw_text": long_text,
            "business_topic_tags": ["proposal"],
            "evidence_type_tags": ["case"],
            "proves": ["proposal workflows can be automated with review controls"],
        },
    )
    captured = {}

    def fake_generate_solution_agent_response(payload):
        captured["payload"] = payload
        return {
            "title": "Proposal Workflow Plan",
            "summary": "Plan",
            "recommended_solutions": [],
            "needed_capabilities": [],
            "dynamic_workers": [],
            "risks": [],
            "next_questions": [],
        }

    monkeypatch.setattr(
        knowledge_asset_service,
        "generate_solution_agent_response",
        fake_generate_solution_agent_response,
        raising=False,
    )

    response = client.post(
        "/api/solution-agent/generate",
        headers=admin_auth_headers,
        json={
            "requirement": "proposal workflow automation",
            "company_profile": "consulting company",
            "project_materials": "proposal templates and approval records",
            "constraints": "manual review required",
            "limit": 3,
        },
    )

    assert response.status_code == 200
    evidence = captured["payload"]["knowledge_context"]["assets"][0]
    assert evidence["compressed_context"]
    assert len(evidence["compressed_context"]) <= 900
    assert response.json()["retrieval_log"]["context_compression"]["included_count"] >= 1


def test_solution_agent_persists_conversation_run_messages_and_steps(
    client, admin_auth_headers, monkeypatch
):
    monkeypatch.setattr(knowledge_asset_service, "generate_knowledge_asset_tags", lambda payload: {})
    client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "Proposal Automation Case",
            "source_type": "company_case",
            "raw_text": "proposal workflow automation approval template qualification",
            "business_topic_tags": ["proposal"],
            "evidence_type_tags": ["case"],
        },
    )
    monkeypatch.setattr(
        knowledge_asset_service,
        "generate_solution_agent_response",
        lambda payload: {
            "title": "Proposal Agent Plan",
            "summary": "Plan",
            "recommended_solutions": [],
            "needed_capabilities": [],
            "dynamic_workers": [],
            "risks": [],
            "next_questions": [],
        },
        raising=False,
    )

    response = client.post(
        "/api/solution-agent/generate",
        headers=admin_auth_headers,
        json={
            "requirement": "proposal workflow automation",
            "company_profile": "consulting company",
            "project_materials": "proposal templates",
            "constraints": "manual review",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["conversation_id"]
    assert data["run_id"]

    messages_response = client.get(
        f"/api/solution-agent/conversations/{data['conversation_id']}/messages",
        headers=admin_auth_headers,
    )
    assert messages_response.status_code == 200
    messages = messages_response.json()["items"]
    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert messages[1]["sources"]
    assert messages[1]["retrieval_log"]["retrieval_mode"] == "hybrid_keyword_bm25_semantic"

    run_response = client.get(
        f"/api/solution-agent/runs/{data['run_id']}",
        headers=admin_auth_headers,
    )
    assert run_response.status_code == 200
    run = run_response.json()
    assert run["status"] == "completed"
    assert run["retrieval_log"]["retrieval_mode"] == "hybrid_keyword_bm25_semantic"
    assert len(run["steps"]) >= 5
    assert run["steps"][0]["stage"] == "understand_requirement"


def test_solution_agent_returns_multi_agent_crew_trace(
    client, admin_auth_headers, monkeypatch
):
    monkeypatch.setattr(knowledge_asset_service, "generate_knowledge_asset_tags", lambda payload: {})
    client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "Proposal Automation Case",
            "source_type": "company_case",
            "raw_text": "proposal workflow automation approval template qualification",
            "business_topic_tags": ["proposal"],
            "evidence_type_tags": ["case"],
            "proves": ["proposal workflows can be automated"],
        },
    )
    monkeypatch.setattr(
        knowledge_asset_service,
        "generate_solution_agent_response",
        lambda payload: {
            "title": "Proposal Agent Plan",
            "summary": "Plan",
            "recommended_solutions": [],
            "needed_capabilities": [],
            "dynamic_workers": [],
            "risks": [],
            "next_questions": [],
        },
        raising=False,
    )

    response = client.post(
        "/api/solution-agent/generate",
        headers=admin_auth_headers,
        json={
            "requirement": "proposal workflow automation",
            "company_profile": "consulting company",
            "project_materials": "proposal templates",
            "constraints": "manual review",
        },
    )

    assert response.status_code == 200
    data = response.json()
    roles = [step["agent_role"] for step in data["crew_trace"]]
    assert roles == [
        "requirement_analyst",
        "evidence_researcher",
        "evidence_critic",
        "solution_writer",
        "delivery_task_designer",
    ]
    assert data["crew_trace"][1]["outputs"]["retrieval_mode"] == "hybrid_keyword_bm25_semantic"
    run = client.get(f"/api/solution-agent/runs/{data['run_id']}", headers=admin_auth_headers).json()
    assert run["steps"][0]["agent_role"] == "requirement_analyst"


def test_solution_agent_marks_uncited_solution_claims_for_review(
    client, admin_auth_headers, monkeypatch
):
    monkeypatch.setattr(knowledge_asset_service, "generate_knowledge_asset_tags", lambda payload: {})
    created = client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "Proposal Automation Case",
            "source_type": "company_case",
            "raw_text": "proposal workflow automation approval template qualification",
            "business_topic_tags": ["proposal"],
            "evidence_type_tags": ["case"],
            "proves": ["proposal workflows can be automated"],
        },
    ).json()

    monkeypatch.setattr(
        knowledge_asset_service,
        "generate_solution_agent_response",
        lambda payload: {
            "title": "Proposal Agent Plan",
            "summary": "Plan",
            "recommended_solutions": [
                {
                    "name": "Proposal workflow automation",
                    "scenario": "proposal approvals",
                    "value": "reduce repeated document work",
                    "related_cases": ["Proposal Automation Case"],
                    "implementation_steps": ["collect templates", "review generated output"],
                },
                {
                    "name": "Guaranteed revenue growth",
                    "scenario": "sales forecasting",
                    "value": "guarantee 50 percent revenue growth",
                    "related_cases": [],
                    "implementation_steps": ["publish guarantee"],
                },
            ],
            "needed_capabilities": [],
            "dynamic_workers": [],
            "risks": [],
            "next_questions": [],
        },
        raising=False,
    )

    response = client.post(
        "/api/solution-agent/generate",
        headers=admin_auth_headers,
        json={
            "requirement": "proposal workflow automation",
            "company_profile": "consulting company",
            "project_materials": "proposal templates",
            "constraints": "manual review",
        },
    )

    assert response.status_code == 200
    data = response.json()
    first_solution = data["solution"]["recommended_solutions"][0]
    assert first_solution["cited_asset_ids"] == [created["id"]]
    assert first_solution["cited_citation_ids"]
    assert data["evidence_self_check"]["status"] == "needs_review"
    assert data["evidence_self_check"]["uncited_solution_count"] == 1
    assert data["unsupported_claims"][0]["name"] == "Guaranteed revenue growth"


def test_solution_agent_stream_emits_trace_and_done_events(
    client, admin_auth_headers, monkeypatch
):
    monkeypatch.setattr(knowledge_asset_service, "generate_knowledge_asset_tags", lambda payload: {})
    client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "Proposal Automation Case",
            "source_type": "company_case",
            "raw_text": "proposal workflow automation approval template qualification",
            "business_topic_tags": ["proposal"],
            "evidence_type_tags": ["case"],
        },
    )
    monkeypatch.setattr(
        knowledge_asset_service,
        "generate_solution_agent_response",
        lambda payload: {
            "title": "Proposal Agent Plan",
            "summary": "Plan",
            "recommended_solutions": [],
            "needed_capabilities": [],
            "dynamic_workers": [],
            "risks": [],
            "next_questions": [],
        },
        raising=False,
    )

    with client.stream(
        "POST",
        "/api/solution-agent/stream",
        headers=admin_auth_headers,
        json={
            "requirement": "proposal workflow automation",
            "company_profile": "consulting company",
            "project_materials": "proposal templates",
            "constraints": "manual review",
        },
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "event: start" in body
    assert "event: trace" in body
    assert "event: done" in body
    assert '"run_id"' in body


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


def test_upload_knowledge_asset_file_splits_long_text_into_assets(client, admin_auth_headers, monkeypatch):
    monkeypatch.setattr(knowledge_asset_service, "generate_knowledge_asset_tags", lambda payload: {})
    body = "\n".join(
        [
            "工程咨询公司需要把官方投标模板、人员资质、项目业绩和审批流程沉淀成资料库。",
            "系统需要支持字段映射、缺口标记、人工复核和最终文档导出。",
            "这些资料来自内部项目复盘，可以证明招投标资料治理有明确业务价值。",
        ]
        * 45
    )

    response = client.post(
        "/api/knowledge-assets/upload",
        headers=admin_auth_headers,
        data={
            "title": "工程招投标资料治理报告",
            "source_type": "official_document",
            "source_name": "行业资料报告",
            "source_confidentiality": "internal",
            "industry_tags": "工程建设",
            "business_topic_tags": "招投标,人员资质库",
            "evidence_type_tags": "官方资料",
        },
        files={"file": ("bidding-report.md", body.encode("utf-8"), "text/markdown")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 2
    assert all(item["source_file_path"] for item in data["items"])
    assert {item["source_type"] for item in data["items"]} == {"official_document"}
    assert data["items"][0]["title"].startswith("工程招投标资料治理报告")
    assert "工程建设" in data["items"][0]["industry_tags"]
    assert "招投标" in data["items"][0]["business_topic_tags"]
    assert "官方资料" in data["items"][0]["evidence_type_tags"]
    assert "投标模板" in data["items"][0]["raw_text"]


def test_solution_agent_generates_solution_from_knowledge_assets(client, admin_auth_headers, monkeypatch):
    client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "招投标资料自动化案例",
            "source_type": "company_case",
            "raw_text": "工程咨询公司把投标模板、人员资质和审批流程做成招投标资料平台，减少重复填报。",
            "industry_tags": ["工程建设"],
            "business_topic_tags": ["招投标", "人员资质库"],
            "evidence_type_tags": ["真实项目经验"],
            "proves": ["招投标资料和人员资质可以系统化管理"],
            "does_not_prove": ["不能证明客户现有资料已经完整"],
        },
    )

    captured = {}

    def fake_generate_solution_agent_response(payload):
        captured["payload"] = payload
        return {
            "title": "招投标资料治理 Agent 方案",
            "summary": "基于知识资产中的投标模板和人员资质库经验生成方案。",
            "recommended_solutions": [
                {
                    "name": "资料模板字段映射系统",
                    "scenario": "官方模板、企业资料和投标文件生成",
                    "value": "减少重复填报和格式错误",
                    "related_cases": ["招投标资料自动化案例"],
                    "implementation_steps": ["资料入库", "字段映射", "人工复核", "导出交付"],
                }
            ],
            "needed_capabilities": ["资料治理", "字段映射", "文档生成"],
            "dynamic_workers": [
                {
                    "name": "资料解析员工",
                    "responsibility": "识别客户资料字段和官方模板要求",
                    "human_review": "人工确认字段口径和资料真实性",
                }
            ],
            "risks": ["客户资料完整度需要人工确认"],
            "next_questions": ["客户现有资质资料是否结构化？"],
        }

    monkeypatch.setattr(
        knowledge_asset_service,
        "generate_solution_agent_response",
        fake_generate_solution_agent_response,
        raising=False,
    )

    response = client.post(
        "/api/solution-agent/generate",
        headers=admin_auth_headers,
        json={
            "requirement": "我们想做招投标资料自动化和人员资质库",
            "company_profile": "工程咨询公司，历史投标文件和人员资质很多。",
            "project_materials": "已有官方模板和项目业绩材料。",
            "constraints": "必须人工复核后导出。",
            "limit": 5,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["model_used"] is True
    assert data["fallback_used"] is False
    assert data["solution"]["title"] == "招投标资料治理 Agent 方案"
    assert data["retrieved_evidence"][0]["title"] == "招投标资料自动化案例"
    assert data["dynamic_workers"][0]["name"] == "资料解析员工"
    assert "人工确认字段口径和资料真实性" in data["human_decision_points"]
    assert captured["payload"]["knowledge_context"]["assets"][0]["title"] == "招投标资料自动化案例"


def test_solution_agent_returns_visible_run_trace_and_evidence_coverage(
    client, admin_auth_headers, monkeypatch
):
    client.post(
        "/api/knowledge-assets/intake",
        headers=admin_auth_headers,
        json={
            "title": "招投标资料自动化案例",
            "source_type": "company_case",
            "raw_text": "工程咨询公司把投标模板、人员资质和审批流程做成招投标资料平台，减少重复填报。",
            "industry_tags": ["工程建设"],
            "business_topic_tags": ["招投标", "人员资质库"],
            "evidence_type_tags": ["真实项目经验"],
            "proves": ["招投标资料和人员资质可以系统化管理"],
            "does_not_prove": ["不能证明客户现有资料已经完整"],
            "applicable_conditions": ["客户已有历史投标模板和人员资质数据"],
            "migration_risks": ["字段口径不统一会影响自动填报质量"],
        },
    )

    monkeypatch.setattr(
        knowledge_asset_service,
        "generate_solution_agent_response",
        lambda payload: {
            "title": "招投标资料治理 Agent 方案",
            "summary": "基于知识资产中的投标模板和人员资质库经验生成方案。",
            "recommended_solutions": [
                {
                    "name": "资料模板字段映射系统",
                    "scenario": "官方模板、企业资料和投标文件生成",
                    "value": "减少重复填报和格式错误",
                    "related_cases": ["招投标资料自动化案例"],
                    "implementation_steps": ["资料入库", "字段映射", "人工复核", "导出交付"],
                }
            ],
            "needed_capabilities": ["资料治理", "字段映射", "文档生成"],
            "dynamic_workers": [
                {
                    "name": "资料解析员工",
                    "responsibility": "识别客户资料字段和官方模板要求",
                    "human_review": "人工确认字段口径和资料真实性",
                }
            ],
            "risks": ["客户资料完整度需要人工确认"],
            "next_questions": ["客户现有资质资料是否结构化？"],
        },
        raising=False,
    )

    response = client.post(
        "/api/solution-agent/generate",
        headers=admin_auth_headers,
        json={
            "requirement": "我们想做招投标资料自动化和人员资质库",
            "company_profile": "工程咨询公司，历史投标文件和人员资质很多。",
            "project_materials": "已有官方模板和项目业绩材料。",
            "constraints": "必须人工复核后导出。",
            "limit": 5,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["agent_trace"] == [
        {"stage": "understand_requirement", "status": "completed", "summary": "已提取客户需求、公司背景、项目资料和约束条件。"},
        {"stage": "retrieve_evidence", "status": "completed", "summary": "检索到 1 条知识资产。"},
        {"stage": "assess_coverage", "status": "needs_review", "summary": "证据覆盖率 56%，仍需补充 4 类信息。"},
        {"stage": "generate_solution", "status": "completed", "summary": "已调用大模型生成方案草案。"},
        {"stage": "assign_dynamic_workers", "status": "completed", "summary": "已生成 1 个动态 AI 执行员工。"},
    ]
    assert data["evidence_coverage"]["score"] == 56
    assert data["evidence_coverage"]["level"] == "partial"
    assert "已有相近案例或资料" in data["evidence_coverage"]["covered"]
    assert "客户现有系统和数据字段" in data["evidence_coverage"]["missing"]
    assert data["clarifying_questions"][0] == "客户现有系统、表格或资料库分别在哪里？"
    assert data["next_actions"][0] == "补充客户现有资料清单、字段样例和模板文件"


def test_solution_agent_requires_more_evidence_before_model_generation(
    client, admin_auth_headers, monkeypatch
):
    called = False

    def fake_generate_solution_agent_response(payload):
        nonlocal called
        called = True
        return {"title": "不应该生成"}

    monkeypatch.setattr(
        knowledge_asset_service,
        "generate_solution_agent_response",
        fake_generate_solution_agent_response,
        raising=False,
    )

    response = client.post(
        "/api/solution-agent/generate",
        headers=admin_auth_headers,
        json={
            "requirement": "客户想做一个行业方案，但是没有提供任何资料。",
            "limit": 5,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert called is False
    assert data["model_used"] is False
    assert data["fallback_used"] is True
    assert data["evidence_coverage"]["score"] == 0
    assert data["evidence_coverage"]["level"] == "insufficient"
    assert data["agent_trace"][2]["status"] == "blocked"
    assert data["agent_trace"][3]["status"] == "skipped"
    assert data["clarifying_questions"][:2] == [
        "客户所在行业、公司规模和当前业务流程是什么？",
        "这次方案优先解决效率、收入、风控还是交付标准化？",
    ]
