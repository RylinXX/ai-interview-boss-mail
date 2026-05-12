from uuid import uuid4

from app.models.models import Resume, ResumeStatus, ScreeningResult


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
