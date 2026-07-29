import pytest
from app.models.models import Resume, Position, PositionStatus, ResumeStatus
from app.services.resume_service import get_resume_page


def test_get_resume_page_score_and_position_filters(db, test_user):
    pos1 = Position(title="AI产品经理", description="描述1", requirements="要求1", department="产品部", status=PositionStatus.OPEN)
    pos2 = Position(title="新媒体运营", description="描述2", requirements="要求2", department="运营部", status=PositionStatus.OPEN)
    db.add_all([pos1, pos2])
    db.commit()

    r1 = Resume(
        candidate_name="张三",
        position_id=pos1.id,
        match_score=85,
        parse_status="success",
        status=ResumeStatus.PENDING_SCREENING
    )
    r2 = Resume(
        candidate_name="李四",
        position_id=pos1.id,
        match_score=65,
        parse_status="success",
        status=ResumeStatus.PENDING_SCREENING
    )
    r3 = Resume(
        candidate_name="王五",
        position_id=pos2.id,
        match_score=45,
        parse_status="success",
        status=ResumeStatus.PENDING_SCREENING
    )
    r4 = Resume(
        candidate_name="赵六",
        position_id=pos2.id,
        match_score=None,
        parse_status="processing",
        status=ResumeStatus.PENDING_SCREENING
    )
    db.add_all([r1, r2, r3, r4])
    db.commit()

    # Test position filter
    res_pos1 = get_resume_page(db, position_id=pos1.id)
    assert res_pos1["total"] == 2
    names1 = [item["candidate_name"] for item in res_pos1["items"]]
    assert "张三" in names1
    assert "李四" in names1

    # Test score range 80-100
    res_high = get_resume_page(db, score_range="80-100")
    assert res_high["total"] == 1
    assert res_high["items"][0]["candidate_name"] == "张三"

    # Test score range 60-79
    res_mid = get_resume_page(db, score_range="60-79")
    assert res_mid["total"] == 1
    assert res_mid["items"][0]["candidate_name"] == "李四"

    # Test score range 0-59
    res_low = get_resume_page(db, score_range="0-59")
    assert res_low["total"] == 1
    assert res_low["items"][0]["candidate_name"] == "王五"

    # Test unscored
    res_unscored = get_resume_page(db, score_range="unscored")
    assert res_unscored["total"] == 1
    assert res_unscored["items"][0]["candidate_name"] == "赵六"

    # Test combined position + score filter
    res_combo = get_resume_page(db, position_id=pos1.id, score_range="80-100")
    assert res_combo["total"] == 1
    assert res_combo["items"][0]["candidate_name"] == "张三"
    assert res_combo["items"][0]["position_name"] == "AI产品经理"
