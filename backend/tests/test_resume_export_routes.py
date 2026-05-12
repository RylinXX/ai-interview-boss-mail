from uuid import uuid4

from app.models.models import Resume, ResumeStatus, ScreeningResult


def test_export_resume_analysis_report_success(client, auth_headers, db, test_position):
    resume = Resume(
        id=uuid4(),
        candidate_name="李明",
        contact="13900139000",
        email="liming@example.com",
        position_id=test_position.id,
        file_path="uploads/resumes/liming.pdf",
        parse_status="success",
        parsed_data={
            "years_of_experience": 6,
            "recent_company": "星河科技",
            "highest_degree": "本科",
            "school": "北京大学",
            "experience_summary": "长期负责增长平台和数据分析产品。",
            "work_experiences": [
                {
                    "company": "星河科技",
                    "role": "高级产品经理",
                    "period": "2021-2024",
                    "summary": "负责增长分析平台。",
                    "capabilities": ["增长分析", "跨团队协作"],
                }
            ],
            "project_experiences": [
                {
                    "name": "招聘漏斗分析",
                    "role": "负责人",
                    "problem": "简历到面试转化率下降",
                    "solution": "搭建分渠道漏斗看板并推动实验。",
                }
            ],
            "interview_questions": [
                {
                    "question": "你如何判断漏斗下降的主因？",
                    "purpose": "验证分析框架",
                }
            ],
        },
        match_score=86,
        ai_review="### 经历概要\n候选人与岗位匹配度较高。",
        status=ResumeStatus.COMPLETED,
        screening_result=ScreeningResult.PASSED,
    )
    db.add(resume)
    db.commit()

    response = client.get(f"/api/resumes/{resume.id}/export", headers=auth_headers)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert "简历分析报告" in response.text
    assert "李明" in response.text
    assert "高级Python工程师" in response.text
    assert "86 分" in response.text
    assert "候选人与岗位匹配度较高" in response.text
    assert "星河科技" in response.text
    assert "招聘漏斗分析" in response.text
    assert "你如何判断漏斗下降的主因？" in response.text


def test_export_resume_analysis_report_not_found(client, auth_headers):
    response = client.get(f"/api/resumes/{uuid4()}/export", headers=auth_headers)

    assert response.status_code == 404
