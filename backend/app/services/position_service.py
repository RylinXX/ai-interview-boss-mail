from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from app.models.models import (
    CodingSubmission,
    CodingTest,
    DepartmentReview,
    Interview,
    InterviewPanel,
    Offer,
    OfferTemplate,
    Position,
    PositionStatus,
    Resume,
    ResumeMailImport,
    ResumeStatus,
    QuestionBank,
    SystemConfig,
    User,
)
from app.schemas.position import PositionCreate, PositionUpdate, PositionStats, PositionWithStats, QuestionBankBrief
from uuid import UUID
from typing import List, Optional
from app.services.ai_service import generate_jd
from fastapi import HTTPException

def create_position(db: Session, position: PositionCreate):
    # 验证外键 hiring_manager_id 是否存在
    if position.hiring_manager_id:
        hiring_manager = db.query(User).filter(User.id == position.hiring_manager_id).first()
        if not hiring_manager:
            raise HTTPException(
                status_code=400,
                detail=f"招聘经理 (hiring_manager_id: {position.hiring_manager_id}) 不存在"
            )

    db_position = Position(**position.dict())
    db.add(db_position)
    db.commit()
    db.refresh(db_position)
    return db_position

def get_positions(db: Session, skip: int = 0, limit: int = 100, status: str = None, title: str = None):
    query = db.query(Position)
    if status:
        query = query.filter(Position.status == status)
    if title:
        query = query.filter(Position.title.ilike(f"%{title}%"))
    return query.order_by(Position.created_at.desc()).offset(skip).limit(limit).all()

def get_positions_with_stats(db: Session, skip: int = 0, limit: int = 100, status: str = None, title: str = None) -> List[PositionWithStats]:
    query = db.query(Position)
    if status:
        query = query.filter(Position.status == status)
    if title:
        query = query.filter(Position.title.ilike(f"%{title}%"))
    
    positions = query.order_by(Position.created_at.desc()).offset(skip).limit(limit).all()
    
    result = []
    for pos in positions:
        stats = get_position_stats(db, pos.id)
        hiring_manager_name = None
        if pos.hiring_manager_id:
            user = db.query(User).filter(User.id == pos.hiring_manager_id).first()
            if user:
                hiring_manager_name = user.full_name
        
        pos_dict = {
            **{c.name: getattr(pos, c.name) for c in pos.__table__.columns},
            'stats': stats.model_dump(),
            'hiring_manager_name': hiring_manager_name
        }
        result.append(PositionWithStats(**pos_dict))
    
    return result

def get_position(db: Session, position_id: UUID):
    return db.query(Position).filter(Position.id == position_id).first()

def get_position_stats(db: Session, position_id: UUID) -> PositionStats:
    resumes = db.query(Resume).filter(Resume.position_id == position_id).all()
    
    stats = PositionStats(
        total_resumes=len(resumes),
        pending_screening=sum(1 for r in resumes if r.status in [
            ResumeStatus.PENDING_SCREENING, 
            ResumeStatus.PENDING_REVIEW
        ]),
        pending_interview=sum(1 for r in resumes if r.status == ResumeStatus.PENDING_INTERVIEW),
        interview_completed=sum(1 for r in resumes if r.status in [
            ResumeStatus.INTERVIEW_PASSED, 
            ResumeStatus.INTERVIEW_FAILED,
            ResumeStatus.OFFER_PENDING,
            ResumeStatus.OFFER_ACCEPTED,
            ResumeStatus.OFFER_REJECTED,
            ResumeStatus.ONBOARDING,
            ResumeStatus.COMPLETED
        ]),
        offer_pending=sum(1 for r in resumes if r.status == ResumeStatus.OFFER_PENDING),
        offer_accepted=sum(1 for r in resumes if r.status in [
            ResumeStatus.OFFER_ACCEPTED,
            ResumeStatus.ONBOARDING,
            ResumeStatus.COMPLETED
        ]),
        rejected=sum(1 for r in resumes if r.status in [
            ResumeStatus.REJECTED,
            ResumeStatus.INTERVIEW_FAILED,
            ResumeStatus.OFFER_REJECTED
        ])
    )
    return stats

def get_linked_question_banks(db: Session, position_id: UUID) -> List[QuestionBankBrief]:
    banks = db.query(QuestionBank).filter(QuestionBank.position_id == position_id).all()
    result = []
    for bank in banks:
        question_count = len(bank.questions) if bank.questions else 0
        result.append(QuestionBankBrief(
            id=bank.id,
            name=bank.name,
            category=bank.category.value if bank.category else "other",
            question_count=question_count
        ))
    return result

def update_position(db: Session, position_id: UUID, position: PositionUpdate):
    db_position = db.query(Position).filter(Position.id == position_id).first()
    if not db_position:
        return None
    
    update_data = position.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_position, key, value)
    
    db.commit()
    db.refresh(db_position)
    return db_position

def delete_position(db: Session, position_id: UUID, force: bool = False):
    db_position = db.query(Position).filter(Position.id == position_id).first()
    if not db_position:
        return None

    related_resumes = db.query(Resume).filter(Resume.position_id == position_id).count()
    if related_resumes > 0 and not force:
        raise HTTPException(
            status_code=400,
            detail=f"无法删除该岗位，存在 {related_resumes} 份关联简历。请先删除关联数据，或使用强制删除。"
        )

    related_banks = db.query(QuestionBank).filter(QuestionBank.position_id == position_id).count()
    if related_banks > 0 and not force:
        raise HTTPException(
            status_code=400,
            detail=f"无法删除该岗位，存在 {related_banks} 个关联题库。请先删除关联数据，或使用强制删除。"
        )

    if force:
        resume_ids = [
            resume_id
            for (resume_id,) in db.query(Resume.id).filter(Resume.position_id == position_id).all()
        ]
        question_bank_ids = [
            bank_id
            for (bank_id,) in db.query(QuestionBank.id).filter(QuestionBank.position_id == position_id).all()
        ]

        coding_test_filters = [CodingTest.position_id == position_id]
        if resume_ids:
            coding_test_filters.append(CodingTest.resume_id.in_(resume_ids))
        if question_bank_ids:
            coding_test_filters.append(CodingTest.question_bank_id.in_(question_bank_ids))
        coding_test_ids = [
            test_id
            for (test_id,) in db.query(CodingTest.id).filter(or_(*coding_test_filters)).all()
        ]
        if coding_test_ids:
            db.query(CodingSubmission).filter(
                CodingSubmission.coding_test_id.in_(coding_test_ids)
            ).delete(synchronize_session=False)
            db.query(CodingTest).filter(CodingTest.id.in_(coding_test_ids)).delete(synchronize_session=False)

        if resume_ids:
            interview_ids = [
                interview_id
                for (interview_id,) in db.query(Interview.id).filter(
                    Interview.resume_id.in_(resume_ids)
                ).all()
            ]
            if interview_ids:
                db.query(InterviewPanel).filter(
                    InterviewPanel.interview_id.in_(interview_ids)
                ).delete(synchronize_session=False)
            db.query(Interview).filter(Interview.resume_id.in_(resume_ids)).delete(synchronize_session=False)
            db.query(DepartmentReview).filter(
                DepartmentReview.resume_id.in_(resume_ids)
            ).delete(synchronize_session=False)
            db.query(Offer).filter(Offer.resume_id.in_(resume_ids)).delete(synchronize_session=False)
            db.query(ResumeMailImport).filter(
                ResumeMailImport.resume_id.in_(resume_ids)
            ).update({"resume_id": None}, synchronize_session=False)
            db.query(Resume).filter(Resume.id.in_(resume_ids)).delete(synchronize_session=False)

        db.query(Offer).filter(Offer.position_id == position_id).delete(synchronize_session=False)
        db.query(OfferTemplate).filter(OfferTemplate.position_id == position_id).update(
            {"position_id": None},
            synchronize_session=False,
        )
        db.query(ResumeMailImport).filter(ResumeMailImport.position_id == position_id).update(
            {"position_id": None},
            synchronize_session=False,
        )
        db.query(SystemConfig).filter(
            SystemConfig.resume_mail_default_position_id == position_id
        ).update({"resume_mail_default_position_id": None}, synchronize_session=False)
        if question_bank_ids:
            db.query(QuestionBank).filter(QuestionBank.id.in_(question_bank_ids)).delete(
                synchronize_session=False
            )

    db.delete(db_position)
    db.commit()
    return db_position

def generate_position_jd(title: str, department: str = None, location: str = None, salary_range: str = None, keywords: str = None) -> dict:
    return generate_jd(
        title=title,
        department=department,
        location=location,
        salary_range=salary_range,
        keywords=keywords
    )
