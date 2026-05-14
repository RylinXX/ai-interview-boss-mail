from uuid import uuid4


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
