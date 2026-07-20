from uuid import uuid4

from app.models.models import Resume, ResumeStatus, ScreeningResult
from app.services.resume_service import public_resume_parse_error


def test_public_resume_parse_error_hides_internal_details():
    resume_id = uuid4()

    nul_error = public_resume_parse_error(
        "sqlalchemy.exc.PendingRollbackError: A string literal cannot contain NUL (0x00) characters",
        resume_id,
    )
    database_error = public_resume_parse_error(
        "psycopg.errors.InFailedSqlTransaction: current transaction is aborted",
        resume_id,
    )

    assert "控制字符" in nul_error
    assert str(resume_id)[:8] in nul_error
    assert "sqlalchemy" not in nul_error.lower()
    assert database_error == f"样本分析失败，请重新提交（编号 {str(resume_id)[:8]}）"


def test_public_resume_parse_error_gives_actionable_file_and_timeout_messages():
    assert public_resume_parse_error("PDF decode failed") == "文件内容无法读取，请确认文件完整且格式受支持"
    assert public_resume_parse_error("upstream request timed out") == "样本分析超时，请稍后重新提交"


def test_reparse_failed_resumes_requeues_failed_only(
    client, admin_auth_headers, db, test_position, monkeypatch
):
    queued_tasks = []

    def fake_process_resume_background(resume_id, position_id, use_user_info=False):
        queued_tasks.append((resume_id, position_id, use_user_info))

    monkeypatch.setattr(
        "app.services.resume_service.process_resume_background",
        fake_process_resume_background,
    )

    failed_resume = Resume(
        id=uuid4(),
        candidate_name="解析失败",
        position_id=test_position.id,
        file_path="uploads/resumes/failed.pdf",
        parse_status="failed",
        parse_error="AI 解析失败",
        match_score=10,
        ai_review="old review",
        status=ResumeStatus.PENDING_SCREENING,
        screening_result=ScreeningResult.PENDING,
    )
    success_resume = Resume(
        id=uuid4(),
        candidate_name="已解析候选人",
        position_id=test_position.id,
        file_path="uploads/resumes/success.pdf",
        parse_status="success",
        parse_error=None,
        match_score=88,
        status=ResumeStatus.PENDING_REVIEW,
        screening_result=ScreeningResult.PASSED,
    )
    db.add_all([failed_resume, success_resume])
    db.commit()

    response = client.post(
        "/api/resumes/reparse-failed",
        headers=admin_auth_headers,
        params={"limit": 20},
    )

    assert response.status_code == 200
    assert response.json()["queued_count"] == 1
    assert response.json()["skipped_count"] == 0
    assert response.json()["total_failed"] == 1
    assert queued_tasks == [(failed_resume.id, test_position.id, False)]

    db.refresh(failed_resume)
    db.refresh(success_resume)
    assert failed_resume.parse_status == "processing"
    assert failed_resume.parse_error is None
    assert failed_resume.candidate_name == "解析中..."
    assert failed_resume.match_score is None
    assert success_resume.parse_status == "success"
    assert success_resume.match_score == 88


def test_reparse_failed_resumes_requeues_without_position(
    client, admin_auth_headers, db, monkeypatch
):
    queued_tasks = []

    def fake_process_resume_background(resume_id, position_id, use_user_info=False):
        queued_tasks.append((resume_id, position_id, use_user_info))

    monkeypatch.setattr(
        "app.services.resume_service.process_resume_background",
        fake_process_resume_background,
    )

    failed_resume = Resume(
        id=uuid4(),
        candidate_name="解析失败",
        position_id=None,
        file_path="uploads/resumes/missing-position.pdf",
        parse_status="failed",
        parse_error="未找到对应岗位",
        status=ResumeStatus.PENDING_SCREENING,
    )
    db.add(failed_resume)
    db.commit()

    response = client.post("/api/resumes/reparse-failed", headers=admin_auth_headers)

    assert response.status_code == 200
    assert response.json()["queued_count"] == 1
    assert response.json()["skipped_count"] == 0
    assert queued_tasks == [(failed_resume.id, None, False)]

    db.refresh(failed_resume)
    assert failed_resume.parse_status == "processing"


def test_resume_page_and_metrics_apply_server_side_filters(
    client, admin_auth_headers, db, test_position
):
    resumes = [
        Resume(
            id=uuid4(),
            candidate_name="产品经理甲",
            position_id=test_position.id,
            file_path="uploads/resumes/pm-a.pdf",
            parse_status="success",
            status=ResumeStatus.PENDING_REVIEW,
            screening_result=ScreeningResult.PASSED,
        ),
        Resume(
            id=uuid4(),
            candidate_name="产品经理乙",
            position_id=test_position.id,
            file_path="uploads/resumes/pm-b.pdf",
            parse_status="failed",
            parse_error="sqlalchemy PendingRollbackError: NUL character",
            parsed_data={
                "experience_summary": "产品规划与落地",
                "project_experiences": [{"name": "项目一"}, {"name": "项目二"}],
                "interview_questions": ["问题一"],
                "business_model_questions": ["问题二", "问题三"],
            },
            status=ResumeStatus.PENDING_SCREENING,
            screening_result=ScreeningResult.PENDING,
        ),
        Resume(
            id=uuid4(),
            candidate_name="销售顾问",
            position_id=test_position.id,
            file_path="uploads/resumes/sales.pdf",
            parse_status="processing",
            status=ResumeStatus.PENDING_SCREENING,
            screening_result=ScreeningResult.PENDING,
        ),
    ]
    db.add_all(resumes)
    db.commit()

    page_response = client.get(
        "/api/resumes/page",
        headers=admin_auth_headers,
        params={"candidate_name": "产品经理", "parse_status": "failed", "limit": 1},
    )
    metrics_response = client.get(
        "/api/resumes/metrics",
        headers=admin_auth_headers,
    )

    assert page_response.status_code == 200
    page = page_response.json()
    assert page["total"] == 1
    assert len(page["items"]) == 1
    assert page["items"][0]["candidate_name"] == "产品经理乙"
    assert page["items"][0]["experience_summary"] == "产品规划与落地"
    assert page["items"][0]["project_count"] == 2
    assert page["items"][0]["question_count"] == 3
    assert "parsed_data" not in page["items"][0]
    assert "sqlalchemy" not in page["items"][0]["parse_error"].lower()
    assert page["metrics"]["total"] == 2
    assert page["metrics"]["success"] == 1
    assert page["metrics"]["failed"] == 1

    assert metrics_response.status_code == 200
    assert metrics_response.json() == {
        "total": 3,
        "success": 1,
        "processing": 1,
        "failed": 1,
        "pending": 0,
    }

    options_response = client.get(
        "/api/resumes/options",
        headers=admin_auth_headers,
        params={"status": "pending_review"},
    )
    assert options_response.status_code == 200
    options = options_response.json()
    assert len(options) == 1
    assert options[0]["candidate_name"] == "产品经理甲"
    assert "parsed_data" not in options[0]
