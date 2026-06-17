"""Seed or delete removable demo data for the AI employee workspace.

Usage inside the backend container:
    python scripts/seed_demo_data.py
    python scripts/seed_demo_data.py --delete
"""

from __future__ import annotations

import argparse
import hashlib
import json
import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import Text as SqlText
from sqlalchemy import cast, or_

from app.config.database import SessionLocal
from app.models.models import (
    AIEmployeeRun,
    AIEmployeeRunStatus,
    CodingSubmission,
    CodingSubmissionStatus,
    CodingTest,
    CodingTestStatus,
    CustomerProject,
    CustomerProjectStatus,
    DepartmentReview,
    IndustryAgentSolutionDraft,
    IndustryAgentSolutionDraftStatus,
    Interview,
    InterviewPanel,
    InterviewResult,
    InterviewStatus,
    KnowledgeAsset,
    KnowledgeAssetReviewStatus,
    Offer,
    OfferStatus,
    Position,
    PositionStatus,
    PositionUrgency,
    ProjectTask,
    ProjectTaskStatus,
    Resume,
    ResumeMailImport,
    ResumeMailImportStatus,
    ResumeStatus,
    ScreeningResult,
    SolutionDocument,
    User,
    UserRole,
)

DEMO_SEED = "DEMO_SEED_20260517"
DEMO_PREFIX = "【演示】"
DEMO_EMAIL_DOMAIN = "demo-seed.local"


def now_minus(days: int = 0, hours: int = 0) -> datetime:
    return datetime.utcnow() - timedelta(days=days, hours=hours)


def stable_uuid(key: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"{DEMO_SEED}:{key}")


def stable_hash(key: str) -> str:
    return hashlib.sha256(f"{DEMO_SEED}:{key}".encode("utf-8")).hexdigest()


def marker_json(value: dict[str, Any]) -> dict[str, Any]:
    return {"demo_seed": DEMO_SEED, **value}


def get_demo_user(db):
    return (
        db.query(User)
        .filter(User.role == UserRole.ADMIN, User.is_active.is_(True))
        .order_by(User.created_at.asc())
        .first()
        or db.query(User).filter(User.is_active.is_(True)).order_by(User.created_at.asc()).first()
        or db.query(User).order_by(User.created_at.asc()).first()
    )


def delete_demo_data(db) -> dict[str, int]:
    counts: dict[str, int] = {}

    demo_resume_ids = [
        row[0]
        for row in db.query(Resume.id)
        .filter(or_(Resume.source == DEMO_SEED, Resume.email.ilike(f"%@{DEMO_EMAIL_DOMAIN}")))
        .all()
    ]
    demo_position_ids = [
        row[0] for row in db.query(Position.id).filter(Position.title.like(f"{DEMO_PREFIX}%")).all()
    ]
    demo_project_ids = [
        row[0]
        for row in db.query(CustomerProject.id)
        .filter(
            or_(
                CustomerProject.name.like(f"{DEMO_PREFIX}%"),
                cast(CustomerProject.diagnosis, SqlText).contains(DEMO_SEED),
            )
        )
        .all()
    ]
    demo_task_ids = []
    if demo_project_ids:
        demo_task_ids = [
            row[0] for row in db.query(ProjectTask.id).filter(ProjectTask.project_id.in_(demo_project_ids)).all()
        ]

    if demo_task_ids:
        counts["ai_employee_runs"] = (
            db.query(AIEmployeeRun)
            .filter(AIEmployeeRun.task_id.in_(demo_task_ids))
            .delete(synchronize_session=False)
        )
        counts["project_tasks"] = (
            db.query(ProjectTask).filter(ProjectTask.id.in_(demo_task_ids)).delete(synchronize_session=False)
        )
    else:
        counts["ai_employee_runs"] = 0
        counts["project_tasks"] = 0

    if demo_project_ids:
        counts["solution_documents"] = (
            db.query(SolutionDocument)
            .filter(SolutionDocument.project_id.in_(demo_project_ids))
            .delete(synchronize_session=False)
        )
        counts["customer_projects"] = (
            db.query(CustomerProject)
            .filter(CustomerProject.id.in_(demo_project_ids))
            .delete(synchronize_session=False)
        )
    else:
        counts["solution_documents"] = 0
        counts["customer_projects"] = 0

    counts["knowledge_assets"] = (
        db.query(KnowledgeAsset)
        .filter(
            or_(
                KnowledgeAsset.title.like(f"{DEMO_PREFIX}%"),
                KnowledgeAsset.source_name == DEMO_SEED,
                KnowledgeAsset.source_file_path == DEMO_SEED,
                cast(KnowledgeAsset.raw_text, SqlText).contains(DEMO_SEED),
            )
        )
        .delete(synchronize_session=False)
    )
    counts["industry_agent_solution_drafts"] = (
        db.query(IndustryAgentSolutionDraft)
        .filter(
            or_(
                cast(IndustryAgentSolutionDraft.request_payload, SqlText).contains(DEMO_SEED),
                cast(IndustryAgentSolutionDraft.result, SqlText).contains(DEMO_SEED),
            )
        )
        .delete(synchronize_session=False)
    )

    if demo_resume_ids:
        demo_interview_ids = [
            row[0] for row in db.query(Interview.id).filter(Interview.resume_id.in_(demo_resume_ids)).all()
        ]
        demo_test_ids = [
            row[0] for row in db.query(CodingTest.id).filter(CodingTest.resume_id.in_(demo_resume_ids)).all()
        ]
        if demo_interview_ids:
            counts["interview_panels"] = (
                db.query(InterviewPanel)
                .filter(InterviewPanel.interview_id.in_(demo_interview_ids))
                .delete(synchronize_session=False)
            )
            counts["interviews"] = (
                db.query(Interview)
                .filter(Interview.id.in_(demo_interview_ids))
                .delete(synchronize_session=False)
            )
        else:
            counts["interview_panels"] = 0
            counts["interviews"] = 0
        if demo_test_ids:
            counts["coding_submissions"] = (
                db.query(CodingSubmission)
                .filter(CodingSubmission.coding_test_id.in_(demo_test_ids))
                .delete(synchronize_session=False)
            )
            counts["coding_tests"] = (
                db.query(CodingTest).filter(CodingTest.id.in_(demo_test_ids)).delete(synchronize_session=False)
            )
        else:
            counts["coding_submissions"] = 0
            counts["coding_tests"] = 0

        counts["offers"] = (
            db.query(Offer).filter(Offer.resume_id.in_(demo_resume_ids)).delete(synchronize_session=False)
        )
        counts["department_reviews"] = (
            db.query(DepartmentReview)
            .filter(DepartmentReview.resume_id.in_(demo_resume_ids))
            .delete(synchronize_session=False)
        )
        counts["resume_mail_imports"] = (
            db.query(ResumeMailImport)
            .filter(ResumeMailImport.resume_id.in_(demo_resume_ids))
            .delete(synchronize_session=False)
        )
        counts["resumes"] = (
            db.query(Resume).filter(Resume.id.in_(demo_resume_ids)).delete(synchronize_session=False)
        )
    else:
        counts.update(
            {
                "interview_panels": 0,
                "interviews": 0,
                "coding_submissions": 0,
                "coding_tests": 0,
                "offers": 0,
                "department_reviews": 0,
                "resume_mail_imports": 0,
                "resumes": 0,
            }
        )

    if demo_position_ids:
        counts["positions"] = (
            db.query(Position).filter(Position.id.in_(demo_position_ids)).delete(synchronize_session=False)
        )
    else:
        counts["positions"] = 0

    db.commit()
    return counts


def build_parsed_data(role: str, specialty: str, score: int) -> dict[str, Any]:
    return marker_json(
        {
            "summary": f"{role}，擅长{specialty}，可作为 AI 员工方案里的能力样本参考。",
            "skills": [specialty, "业务诊断", "流程拆解", "AI 工具落地", "跨部门协同"],
            "work_experiences": [
                {
                    "company": "匿名项目经验",
                    "position": role,
                    "duration": "2022-2025",
                    "description": f"负责{specialty}相关项目，从需求访谈、流程梳理到上线验收。",
                }
            ],
            "project_experiences": [
                {
                    "name": f"{specialty}智能化改造项目",
                    "role": role,
                    "business_context": "客户已有模板、台账和历史沟通记录，但缺少可复用的知识结构。",
                    "actions": ["梳理业务流程", "沉淀知识资产", "设计 AI 员工工作流"],
                    "outcome": f"把人工处理周期缩短约 {max(20, score - 50)}%，关键节点形成可追溯记录。",
                },
                {
                    "name": "跨部门交付标准化项目",
                    "role": "方案负责人",
                    "business_context": "销售、交付、运营对客户问题理解不一致。",
                    "actions": ["统一诊断问卷", "建立方案模板", "设计验收指标"],
                    "outcome": "交付口径统一，项目复盘材料可直接进入知识库。",
                },
            ],
            "interview_questions": [
                {
                    "question": f"请复盘一个你做过的{specialty}项目，哪些环节最适合交给 AI 员工？",
                    "target_project": f"{specialty}智能化改造项目",
                    "purpose": "验证候选人是否能把业务流程拆成可执行任务。",
                },
                {
                    "question": "如果客户只给你零散文档，你会如何判断哪些内容能沉淀为知识资产？",
                    "purpose": "验证知识抽取和证据分级能力。",
                },
            ],
            "business_model_questions": [
                {
                    "question": "这个项目的付费人、使用人和验收人分别是谁？",
                    "missing_context": "需要补充客户决策链与验收口径。",
                }
            ],
            "experience_completion_questions": [
                {
                    "question": "补充一个失败案例，说明你如何处理客户预期与交付边界冲突。",
                    "target_experience": "跨部门交付标准化项目",
                }
            ],
            "strengths": ["能把经验转换成模板", "能识别关键业务指标", "适合参与售前方案"],
            "risks": ["需要核实真实行业深度", "需观察复杂客户沟通能力"],
        }
    )


def seed_recruiting_data(db, user_id):
    positions = [
        Position(
            title=f"{DEMO_PREFIX}AI 产品经理",
            description="负责 AI 员工产品需求、业务流程建模、知识资产产品化。",
            requirements="3 年以上产品经验，熟悉企业服务、LLM 应用、B 端交付。",
            salary_range="25k-40k",
            location="北京/远程",
            department="AI 员工事业部",
            status=PositionStatus.OPEN,
            urgency=PositionUrgency.HIGH,
            headcount=2,
            hiring_manager_id=user_id,
            created_at=now_minus(days=9),
        ),
        Position(
            title=f"{DEMO_PREFIX}行业解决方案顾问",
            description="负责客户诊断、行业方案包装、售前演示与交付验收。",
            requirements="熟悉企业数字化项目，能输出高质量方案文档。",
            salary_range="22k-35k",
            location="上海/远程",
            department="解决方案中心",
            status=PositionStatus.OPEN,
            urgency=PositionUrgency.MEDIUM,
            headcount=3,
            hiring_manager_id=user_id,
            created_at=now_minus(days=7),
        ),
    ]
    db.add_all(positions)
    db.flush()

    candidates = [
        ("周以宁", "AI 产品经理", "行业方案产品化", 91, ResumeStatus.PENDING_INTERVIEW, "interview", positions[0].id),
        ("陈知远", "业务分析师", "客户诊断与流程梳理", 86, ResumeStatus.PENDING_DEPT_REVIEW, "screening", positions[1].id),
        ("林若初", "行业研究员", "政策/竞品/行业研究", 82, ResumeStatus.INTERVIEW_PASSED, "offer", positions[1].id),
        ("许嘉禾", "实施规划经理", "上线计划与验收指标", 78, ResumeStatus.OFFER_PENDING, "offer", positions[1].id),
        ("孟清妍", "数据分析师", "指标体系与经营看板", 88, ResumeStatus.COMPLETED, "hired", positions[0].id),
        ("赵云舒", "运营顾问", "私域运营和客服质检", 73, ResumeStatus.WAITLIST, "screening", positions[1].id),
        ("韩沐阳", "AI 工作流工程师", "RPA 与 LLM 编排", 84, ResumeStatus.PENDING_INTERVIEW, "interview", positions[0].id),
        ("苏见微", "知识库运营", "知识标签与素材治理", 76, ResumeStatus.PENDING_REVIEW, "screening", positions[1].id),
    ]

    resumes: list[Resume] = []
    for index, (name, role, specialty, score, status, stage, position_id) in enumerate(candidates, start=1):
        parsed = build_parsed_data(role, specialty, score)
        raw_text = (
            f"{DEMO_SEED}\n{name} - {role}\n"
            f"核心能力：{specialty}、业务诊断、AI 员工落地。\n"
            "项目经历：参与多个企业智能化改造项目，沉淀流程模板、知识资产和验收指标。"
        )
        resume = Resume(
            candidate_name=f"{DEMO_PREFIX}{name}",
            contact=f"1380000{index:04d}",
            email=f"demo-candidate-{index}@{DEMO_EMAIL_DOMAIN}",
            position_id=position_id,
            file_path=f"/uploads/demo/{DEMO_SEED}/candidate-{index}.pdf",
            raw_text=raw_text,
            resume_markdown=f"# {name}\n\n{raw_text}\n",
            parsed_data=parsed,
            match_score=score,
            parse_status="success",
            parsed_at=now_minus(days=2, hours=index),
            source=DEMO_SEED,
            source_message_id=f"{DEMO_SEED}-message-{index}",
            source_attachment_hash=stable_hash(f"resume-{index}"),
            screening_result=ScreeningResult.PASSED,
            ai_review=(
                f"演示评估：{name}的{specialty}经验完整，适合用于 AI 员工方案能力样本。"
                "建议通过项目复盘验证其行业深度和落地能力。"
            ),
            hr_review="演示数据：已通过初筛，等待业务方进一步确认。",
            status=status,
            stage=stage,
            other_position_matches=[
                {"position": "AI 解决方案顾问", "score": max(60, score - 6), "reason": "具备客户诊断与方案输出能力"},
                {"position": "知识资产运营", "score": max(55, score - 12), "reason": "能整理案例、SOP 与业务模板"},
            ],
            created_at=now_minus(days=6, hours=index),
        )
        resumes.append(resume)

    db.add_all(resumes)
    db.flush()

    for index, resume in enumerate(resumes[:6], start=1):
        db.add(
            ResumeMailImport(
                message_uid=f"{DEMO_SEED}-uid-{index}",
                message_id=f"<{DEMO_SEED}-{index}@demo>",
                mailbox="demo@ai.etgq.com",
                sender=f"candidate-{index}@{DEMO_EMAIL_DOMAIN}",
                subject=f"【演示】{resume.candidate_name} 投递 AI 员工项目",
                received_at=now_minus(days=6, hours=index),
                attachment_filename=f"{resume.candidate_name}.pdf",
                attachment_sha256=stable_hash(f"mail-import-{index}"),
                position_id=resume.position_id,
                resume_id=resume.id,
                status=ResumeMailImportStatus.IMPORTED.value,
                reason=f"{DEMO_SEED} 演示导入记录",
            )
        )

    if user_id:
        for resume, tech, exp, overall, comment in [
            (resumes[0], 9, 9, 9, "演示评审：能独立拆解 AI 员工产品模块，建议进入终面。"),
            (resumes[1], 8, 9, 8, "演示评审：业务访谈经验扎实，建议补充行业案例深度。"),
            (resumes[2], 8, 8, 8, "演示评审：行业研究能力强，可作为方案知识库共建角色。"),
        ]:
            db.add(
                DepartmentReview(
                    resume_id=resume.id,
                    reviewer_id=user_id,
                    technical_score=tech,
                    experience_score=exp,
                    overall_score=overall,
                    recommendation="recommend",
                    comment=comment,
                    is_completed=True,
                    created_at=now_minus(days=3),
                )
            )

    interviews = [
        Interview(
            resume_id=resumes[0].id,
            position_id=resumes[0].position_id,
            interviewer_id=user_id,
            interviewer="演示面试官",
            round=1,
            interview_time=now_minus(days=1),
            interview_type="video",
            interview_category="comprehensive",
            meeting_link="https://example.com/demo-meeting",
            questions=[
                {"question": "请讲一个 AI 员工方案从 0 到 1 的设计过程。"},
                {"question": "如何判断客户的文档是否足够支撑自动化？"},
            ],
            scores={"business": 88, "product": 91, "communication": 86},
            comments={"summary": "演示数据：候选人能把业务流程转成产品化模块。"},
            total_score=88,
            panel_members=[str(user_id)] if user_id else [],
            result=InterviewResult.NEXT_ROUND,
            evaluation="演示面试结论：建议进入下一轮，重点追问复杂客户协同经验。",
            suggestion="进入方案实战面。",
            status=InterviewStatus.COMPLETED,
            created_at=now_minus(days=1),
        ),
        Interview(
            resume_id=resumes[6].id,
            position_id=resumes[6].position_id,
            interviewer_id=user_id,
            interviewer="演示面试官",
            round=1,
            interview_time=datetime.utcnow() + timedelta(days=2),
            interview_type="video",
            interview_category="technical",
            questions=[{"question": "如何设计一个可回滚的简历解析并发队列？"}],
            result=InterviewResult.PENDING,
            status=InterviewStatus.SCHEDULED,
            created_at=now_minus(hours=12),
        ),
    ]
    db.add_all(interviews)
    db.flush()

    if user_id:
        db.add(
            InterviewPanel(
                interview_id=interviews[0].id,
                interviewer_id=user_id,
                scores={"product": 9, "business": 9, "delivery": 8},
                comments={"summary": "演示小组评分：方案表达清晰，有客户诊断框架。"},
                total_score=88,
                is_submitted=True,
            )
        )

    offer = Offer(
        resume_id=resumes[3].id,
        position_id=resumes[3].position_id,
        candidate_name=resumes[3].candidate_name,
        candidate_email=resumes[3].email,
        salary_monthly=32000,
        salary_annual=448000,
        salary_structure="14 薪，含绩效奖金",
        position_title="行业解决方案顾问",
        department="解决方案中心",
        report_to="AI 员工业务负责人",
        work_location="北京/远程",
        work_hours="弹性工作制",
        onboard_date=datetime.utcnow() + timedelta(days=21),
        probation_months=3,
        benefits="五险一金、年度体检、AI 工具预算",
        bonus="年度项目奖金",
        notes=f"{DEMO_SEED} 演示 Offer，可删除。",
        valid_until=datetime.utcnow() + timedelta(days=7),
        status=OfferStatus.PENDING,
        token=f"{DEMO_SEED}-offer-token",
        created_by=user_id,
        created_at=now_minus(hours=8),
    )
    db.add(offer)

    coding_test = CodingTest(
        title=f"{DEMO_PREFIX}AI 工作流设计题",
        description="给定客户简历解析、知识资产入库和方案生成流程，设计异步队列与失败重试策略。",
        test_type="essay",
        difficulty="senior",
        language="python",
        starter_code="# 说明你的任务拆分、队列设计和数据一致性策略\n",
        test_cases=[{"input": "100 resumes", "expected": "concurrent processing with retries"}],
        public_token=f"{DEMO_SEED}-coding-test",
        status=CodingTestStatus.PUBLISHED,
        questions=[
            {
                "title": "并发解析任务设计",
                "description": "说明如何避免服务重启后任务丢失，并支持批量重试。",
            }
        ],
        duration_minutes=90,
        created_by=user_id,
        resume_id=resumes[6].id,
        position_id=resumes[6].position_id,
        created_at=now_minus(days=2),
    )
    db.add(coding_test)
    db.flush()
    db.add(
        CodingSubmission(
            coding_test_id=coding_test.id,
            candidate_name=resumes[6].candidate_name,
            candidate_email=resumes[6].email,
            language="python",
            answers={"essay": "使用数据库状态作为事实源，worker 启动时恢复 processing 任务并限制并发。"},
            run_result={"summary": "演示提交，结构完整。"},
            passed=True,
            score=86,
            ai_evaluation="演示评估：能覆盖重试、幂等、并发上限和失败告警。",
            status=CodingSubmissionStatus.EVALUATED,
            submitted_at=now_minus(days=1),
            evaluated_at=now_minus(hours=20),
        )
    )

    return positions, resumes


def seed_knowledge_assets(db, user_id, resumes: list[Resume]):
    asset_specs = [
        (
            "官方模板字段映射：处置方案申报表",
            "document",
            ["政企服务", "工程咨询"],
            ["材料填报", "资质治理"],
            ["模板字段映射", "自动填报"],
            ["RPA", "LLM 表单理解"],
            0.91,
        ),
        (
            "制造业售后知识库搭建方法",
            "case",
            ["制造业", "售后服务"],
            ["客服工单", "知识库"],
            ["工单分类", "维修问答"],
            ["知识抽取", "检索增强"],
            0.88,
        ),
        (
            "客服质检指标与抽检规则",
            "sop",
            ["本地生活", "连锁门店"],
            ["客服质检", "服务体验"],
            ["通话质检", "文本质检"],
            ["质检评分", "异常归因"],
            0.84,
        ),
        (
            "私域会员分层运营 SOP",
            "sop",
            ["本地生活", "零售"],
            ["私域运营", "会员增长"],
            ["会员分层", "触达策略"],
            ["运营策略", "自动化触达"],
            0.82,
        ),
        (
            "投标文件资质归档规则",
            "document",
            ["政企服务", "招投标"],
            ["资质归档", "投标文件"],
            ["文件校验", "证照管理"],
            ["文档审查", "知识库"],
            0.86,
        ),
        (
            "智能客服 FAQ 冷启动样本",
            "faq",
            ["SaaS", "客服中心"],
            ["FAQ", "冷启动"],
            ["问答对生成", "知识覆盖"],
            ["客服机器人", "检索增强"],
            0.8,
        ),
        (
            "RPA+LLM 表单填报案例",
            "case",
            ["政企服务", "金融服务"],
            ["自动填报", "审批流"],
            ["流程自动化", "异常复核"],
            ["RPA", "LLM 审核"],
            0.89,
        ),
        (
            "门店巡检异常闭环数据口径",
            "sop",
            ["连锁门店", "运营管理"],
            ["巡检", "异常闭环"],
            ["门店执行", "整改跟踪"],
            ["数据看板", "任务分派"],
            0.78,
        ),
    ]

    assets: list[KnowledgeAsset] = []
    for index, (title, source_type, industries, topics, scenarios, capabilities, strength) in enumerate(asset_specs, start=1):
        asset = KnowledgeAsset(
            title=f"{DEMO_PREFIX}{title}",
            source_type=source_type,
            source_name=DEMO_SEED,
            source_file_path=DEMO_SEED,
            source_resume_id=resumes[index % len(resumes)].id if resumes else None,
            source_confidentiality="internal",
            raw_text=(
                f"{DEMO_SEED}\n"
                f"这是一条用于演示知识资产页面、AI 产品经理草稿和行业方案检索的样本素材：{title}。"
            ),
            summary=f"演示素材：{title}。可用于生成客户诊断、方案文档和 AI 员工任务。",
            industry_tags=industries,
            business_topic_tags=topics,
            scenario_tags=scenarios,
            evidence_type_tags=[source_type, "demo"],
            capability_tags=capabilities,
            methodology_tags=["访谈诊断", "模板化交付", "效果评估"],
            customer_type_tags=["成长型企业", "项目制客户"],
            value_tags=["降本增效", "交付标准化", "知识复用"],
            proves=[
                f"可以把{topics[0]}流程拆解为 AI 员工任务",
                "可作为方案文档里的案例证据",
            ],
            does_not_prove=["不代表真实客户背书", "不替代正式验收数据"],
            applicable_conditions=["已有基础文档或历史记录", "客户愿意配合流程访谈"],
            migration_risks=["数据口径不一致会影响自动化效果", "历史材料质量不足时需要人工补齐"],
            evidence_strength_score=strength,
            data_verification_score=max(0.72, strength - 0.08),
            commercial_value_score=max(0.76, strength - 0.03),
            relevance_score=strength,
            confidence_score=max(0.74, strength - 0.05),
            confidence_reason="演示数据，字段完整度高，适合检验页面布局和检索效果。",
            manual_review_status=KnowledgeAssetReviewStatus.REVIEWED
            if index <= 6
            else KnowledgeAssetReviewStatus.UNREVIEWED,
            created_by=user_id,
            created_at=now_minus(days=5, hours=index),
            updated_at=now_minus(days=1, hours=index),
        )
        assets.append(asset)

    db.add_all(assets)
    db.flush()
    return assets


def solution_sections(title: str, industry: str, focus: str) -> dict[str, Any]:
    return marker_json(
        {
            "executive_summary": f"面向{industry}的{focus}场景，建立业务诊断、知识资产、AI 员工执行和人工复核闭环。",
            "pain_point_map": [
                {"pain_point": "资料分散", "impact": "交付重复劳动高", "ai_response": "自动归档和标签化"},
                {"pain_point": "流程依赖人工经验", "impact": "新人交付质量波动", "ai_response": "标准任务模板和检查清单"},
                {"pain_point": "效果难证明", "impact": "续费与扩展困难", "ai_response": "指标看板和复盘报告"},
            ],
            "solution_modules": [
                {"name": "诊断问卷", "owner": "业务分析 AI 员工", "output": "客户问题分类与追问清单"},
                {"name": "知识资产治理", "owner": "行业研究 AI 员工", "output": "素材标签、证据强度和适用边界"},
                {"name": "方案生成", "owner": "产品经理 AI 员工", "output": "可交付方案文档与路线图"},
                {"name": "上线验收", "owner": "实施规划 AI 员工", "output": "里程碑、指标、风险清单"},
            ],
            "metrics": [
                "人工整理时间下降 40%",
                "方案初稿 1 个工作日内产出",
                "客户追问闭环率达到 90%",
            ],
            "demo_title": title,
        }
    )


def seed_business_projects(db, user_id, assets: list[KnowledgeAsset], resumes: list[Resume]):
    project_specs = [
        {
            "name": "制造企业售后工单与知识库 AI 员工项目",
            "industry": "制造业/售后服务",
            "scale": "300-800 人，区域售后团队 60 人",
            "model": "设备销售 + 售后维保服务，售后响应速度直接影响续约。",
            "pain": ["工单分类靠人工经验", "维修知识散落在聊天记录", "新人培训周期长"],
            "goals": ["建立售后知识库", "提升首响和一次解决率", "形成可复用工单处置方案"],
            "status": CustomerProjectStatus.READY,
            "focus": "售后工单自动分诊",
        },
        {
            "name": "政企申报材料自动填报与资质治理项目",
            "industry": "政企服务/工程咨询",
            "scale": "120 人，年处理 300+ 申报项目",
            "model": "项目制咨询服务，以材料质量和交付速度作为核心竞争力。",
            "pain": ["模板版本混乱", "资质证照复用难", "重复填表占用顾问时间"],
            "goals": ["沉淀材料模板库", "自动生成填报草稿", "降低材料返工率"],
            "status": CustomerProjectStatus.DESIGNING,
            "focus": "申报材料自动填报",
        },
        {
            "name": "本地生活私域增长与客服质检项目",
            "industry": "本地生活/连锁门店",
            "scale": "80 家门店，私域会员 40 万",
            "model": "门店消费 + 私域复购，依赖客服、活动和门店执行协同。",
            "pain": ["客服话术不统一", "会员分层粗糙", "门店活动复盘慢"],
            "goals": ["建立客服质检模型", "自动生成会员运营方案", "闭环门店执行异常"],
            "status": CustomerProjectStatus.DIAGNOSING,
            "focus": "私域增长与质检闭环",
        },
    ]

    stage_specs = [
        ("source_collection", "收集客户资料与历史案例", "归集模板、聊天记录、工单和历史方案", "资料清单与可用证据分级", "industry_researcher"),
        ("diagnosis", "生成客户诊断报告", "识别痛点类型、根因假设和追问问题", "诊断摘要与追问清单", "business_analyst"),
        ("capability_matching", "匹配能力样本与知识资产", "从简历样本和知识资产中找可复用经验", "能力匹配矩阵", "industry_researcher"),
        ("solution_design", "输出 AI 员工方案草稿", "设计模块、流程、人工复核点和交付边界", "方案文档草稿", "product_manager"),
        ("metrics", "定义效果指标和验收口径", "拆解效率、质量、商业价值指标", "验收指标表", "data_analyst"),
        ("roadmap", "制定上线计划和风险预案", "安排试点、培训、复盘和扩展计划", "实施路线图", "implementation_planner"),
    ]

    projects: list[CustomerProject] = []
    for index, spec in enumerate(project_specs, start=1):
        diagnosis = marker_json(
            {
                "problem_categories": ["知识沉淀不足", "人工流程重复", "跨角色协同断点"],
                "root_cause_hypotheses": [
                    f"{spec['industry']}场景缺少统一资料入口，导致经验无法复用。",
                    "业务专家的判断没有模板化，AI 无法稳定调用。",
                    "交付指标没有前置定义，验收阶段难证明价值。",
                ],
                "next_questions": [
                    "目前最耗时的人工节点是哪一个？",
                    "哪些历史材料可以作为自动化输入？",
                    "上线后谁负责人工复核和效果确认？",
                ],
                "priority": "先做高频低风险环节，再扩展到复杂决策。",
            }
        )
        project = CustomerProject(
            name=f"{DEMO_PREFIX}{spec['name']}",
            industry=spec["industry"],
            company_scale=spec["scale"],
            business_model=spec["model"],
            pain_points=spec["pain"],
            goals=spec["goals"],
            status=spec["status"],
            diagnosis=diagnosis,
            created_by=user_id,
            created_at=now_minus(days=10 - index),
            updated_at=now_minus(hours=index * 3),
        )
        db.add(project)
        db.flush()

        sections = solution_sections(spec["name"], spec["industry"], spec["focus"])
        content = f"""# {DEMO_PREFIX}{spec['name']}方案

## 项目摘要
围绕{spec['focus']}，先把客户已有材料转成知识资产，再由 AI 员工生成诊断、方案、指标和实施计划。

## 核心模块
- 诊断问卷模板：识别痛点、目标、约束和验收人。
- 知识资产模板：将历史材料按行业、场景、证据强度入库。
- AI 员工工作流：业务分析、行业研究、产品经理、数据分析、实施规划分工。
- 人工复核机制：关键输出由负责人确认后进入客户交付稿。

## 交付物
1. 客户诊断报告
2. AI 员工任务清单
3. 方案文档模板
4. 上线路线图与风险清单

> {DEMO_SEED} 演示文档，可在后续清理。
"""
        db.add(
            SolutionDocument(
                project_id=project.id,
                title=f"{DEMO_PREFIX}{spec['focus']}解决方案",
                content=content,
                sections=sections,
                created_at=now_minus(days=4, hours=index),
                updated_at=now_minus(hours=index),
            )
        )

        linked_assets = [str(asset.id) for asset in assets[index - 1 : index + 2]]
        linked_resumes = [str(resume.id) for resume in resumes[index - 1 : index + 2]]
        for task_index, (stage, title, desc, expected, employee) in enumerate(stage_specs, start=1):
            if spec["status"] == CustomerProjectStatus.DIAGNOSING and task_index > 3:
                task_status = ProjectTaskStatus.TODO
            elif spec["status"] == CustomerProjectStatus.DESIGNING and task_index > 4:
                task_status = ProjectTaskStatus.REVIEW
            else:
                task_status = ProjectTaskStatus.DONE
            task = ProjectTask(
                project_id=project.id,
                stage=stage,
                title=f"{DEMO_PREFIX}{title}",
                description=desc,
                expected_output=expected,
                status=task_status,
                assignee_type="ai_employee",
                ai_employee_type=employee,
                linked_capability_sample_ids=linked_assets + linked_resumes,
                output=marker_json(
                    {
                        "draft": f"{spec['focus']} - {expected}：已根据演示知识资产生成第一版，可用于页面预览。",
                        "key_points": [
                            "先复用已有模板和历史案例",
                            "输出必须带证据来源和适用边界",
                            "关键节点保留人工确认",
                        ],
                        "recommended_next_step": "安排客户访谈确认输入材料质量。",
                    }
                ),
                created_at=now_minus(days=5, hours=task_index),
                updated_at=now_minus(hours=task_index),
            )
            db.add(task)
            db.flush()
            if task_status in {ProjectTaskStatus.DONE, ProjectTaskStatus.REVIEW}:
                db.add(
                    AIEmployeeRun(
                        task_id=task.id,
                        employee_type=employee,
                        status=AIEmployeeRunStatus.ACCEPTED
                        if task_status == ProjectTaskStatus.DONE
                        else AIEmployeeRunStatus.DRAFT,
                        prompt_context=marker_json(
                            {
                                "project": spec["name"],
                                "stage": stage,
                                "input_assets": linked_assets[:2],
                            }
                        ),
                        output=marker_json(
                            {
                                "summary": f"{employee} 已完成 {title} 的演示输出。",
                                "draft": f"围绕{spec['focus']}，建议采用分阶段上线、指标验证、模板复用的交付路径。",
                            }
                        ),
                        reviewer_decision="演示数据：业务负责人已采纳"
                        if task_status == ProjectTaskStatus.DONE
                        else "演示数据：待复核",
                        created_at=now_minus(days=2, hours=task_index),
                        updated_at=now_minus(hours=task_index),
                    )
                )

        projects.append(project)

    db.flush()
    return projects


def seed_industry_draft(db, user_id, assets: list[KnowledgeAsset]):
    result = marker_json(
        {
            "title": "企业 AI 员工方案包：从资料治理到方案自动生成",
            "summary": "演示方案：适合先从资料标准化、知识资产入库和方案初稿生成三个环节切入。",
            "knowledge_context": {
                "asset_count": len(assets),
                "project_count": 8,
                "work_count": 8,
                "candidate_count": 8,
                "strongest_assets": [asset.title for asset in assets[:4]],
                "coverage": ["制造业售后", "政企申报", "本地生活私域", "客服质检"],
            },
            "recommended_solutions": [
                {
                    "name": "客户诊断 AI 员工",
                    "scenario": "售前访谈和项目启动",
                    "value": "自动整理痛点、目标、约束和追问清单。",
                    "deliverables": ["诊断报告", "追问问题", "方案边界"],
                },
                {
                    "name": "知识资产治理 AI 员工",
                    "scenario": "资料入库和案例复用",
                    "value": "把简历、案例、模板、SOP 转成可检索证据。",
                    "deliverables": ["标签体系", "证据评分", "适用条件"],
                },
                {
                    "name": "方案产品经理 AI 员工",
                    "scenario": "根据行业和客户目标生成方案",
                    "value": "产出模块、路线图、指标和风险。",
                    "deliverables": ["方案草稿", "任务清单", "验收指标"],
                },
            ],
            "needed_capabilities": ["行业知识库", "模板字段映射", "RAG 检索", "多 Agent 任务编排"],
            "risks": ["客户材料质量不足", "验收指标未提前定义", "人工复核责任不清"],
            "next_questions": [
                "先选择哪个行业作为演示样板？",
                "客户已有材料中哪些可以公开用于训练或检索？",
                "方案产出后由谁确认最终口径？",
            ],
        }
    )
    draft = IndustryAgentSolutionDraft(
        status=IndustryAgentSolutionDraftStatus.COMPLETED,
        stage="completed",
        current_step="演示方案已生成",
        progress=100,
        request_payload=marker_json(
            {
                "industry": "企业服务/AI 员工",
                "business_type": "售前方案与交付工作台",
                "pain_points": ["页面缺少可展示数据", "需要看到完整流程效果"],
                "goals": ["生成可演示方案", "验证知识资产和项目工作台联动"],
            }
        ),
        result=result,
        created_by=user_id,
        created_at=now_minus(hours=6),
        updated_at=now_minus(hours=1),
        completed_at=now_minus(hours=1),
    )
    db.add(draft)
    db.flush()
    return draft


def seed_demo_data(db) -> dict[str, Any]:
    delete_counts = delete_demo_data(db)
    user = get_demo_user(db)
    user_id = user.id if user else None

    positions, resumes = seed_recruiting_data(db, user_id)
    assets = seed_knowledge_assets(db, user_id, resumes)
    projects = seed_business_projects(db, user_id, assets, resumes)
    draft = seed_industry_draft(db, user_id, assets)
    db.commit()

    return {
        "demo_seed": DEMO_SEED,
        "deleted_before_seed": delete_counts,
        "created": {
            "positions": len(positions),
            "resumes": len(resumes),
            "knowledge_assets": len(assets),
            "customer_projects": len(projects),
            "industry_agent_solution_drafts": 1,
            "latest_draft_id": str(draft.id),
        },
    }


def verify_counts(db) -> dict[str, int]:
    demo_resume_ids = [
        row[0]
        for row in db.query(Resume.id)
        .filter(or_(Resume.source == DEMO_SEED, Resume.email.ilike(f"%@{DEMO_EMAIL_DOMAIN}")))
        .all()
    ]
    demo_project_ids = [
        row[0] for row in db.query(CustomerProject.id).filter(CustomerProject.name.like(f"{DEMO_PREFIX}%")).all()
    ]
    demo_task_ids = []
    if demo_project_ids:
        demo_task_ids = [
            row[0] for row in db.query(ProjectTask.id).filter(ProjectTask.project_id.in_(demo_project_ids)).all()
        ]
    return {
        "positions": db.query(Position).filter(Position.title.like(f"{DEMO_PREFIX}%")).count(),
        "resumes": len(demo_resume_ids),
        "resume_mail_imports": db.query(ResumeMailImport).filter(ResumeMailImport.resume_id.in_(demo_resume_ids)).count()
        if demo_resume_ids
        else 0,
        "department_reviews": db.query(DepartmentReview).filter(DepartmentReview.resume_id.in_(demo_resume_ids)).count()
        if demo_resume_ids
        else 0,
        "interviews": db.query(Interview).filter(Interview.resume_id.in_(demo_resume_ids)).count()
        if demo_resume_ids
        else 0,
        "offers": db.query(Offer).filter(Offer.resume_id.in_(demo_resume_ids)).count() if demo_resume_ids else 0,
        "coding_tests": db.query(CodingTest).filter(CodingTest.resume_id.in_(demo_resume_ids)).count()
        if demo_resume_ids
        else 0,
        "knowledge_assets": db.query(KnowledgeAsset).filter(KnowledgeAsset.title.like(f"{DEMO_PREFIX}%")).count(),
        "customer_projects": len(demo_project_ids),
        "project_tasks": len(demo_task_ids),
        "ai_employee_runs": db.query(AIEmployeeRun).filter(AIEmployeeRun.task_id.in_(demo_task_ids)).count()
        if demo_task_ids
        else 0,
        "solution_documents": db.query(SolutionDocument).filter(SolutionDocument.project_id.in_(demo_project_ids)).count()
        if demo_project_ids
        else 0,
        "industry_agent_solution_drafts": db.query(IndustryAgentSolutionDraft)
        .filter(cast(IndustryAgentSolutionDraft.request_payload, SqlText).contains(DEMO_SEED))
        .count(),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--delete", action="store_true", help="delete demo data instead of seeding it")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.delete:
            result = {"demo_seed": DEMO_SEED, "deleted": delete_demo_data(db)}
        else:
            result = seed_demo_data(db)
        result["verified_counts"] = verify_counts(db)
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    finally:
        db.close()


if __name__ == "__main__":
    main()
