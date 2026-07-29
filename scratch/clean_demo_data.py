import os
from sqlalchemy import create_engine, or_, func, text
from sqlalchemy.orm import sessionmaker
from app.models.models import Resume, Position, ResumeMailImport, Interview, DepartmentReview, QuestionBank


def inspect_and_clean_demo_data(db):
    print("=== INSPECTING POSITIONS ===")
    positions = db.query(Position).all()
    demo_position_ids = []
    for p in positions:
        is_demo = False
        if p.title and ("【演示】" in p.title or "Demo" in p.title or p.title == "AI 产品经理"):
            is_demo = True
            demo_position_ids.append(p.id)
        print(f"Position ID: {p.id} | Title: {p.title} | Is Demo: {is_demo}")

    print("\n=== INSPECTING RESUMES ===")
    total_resumes = db.query(Resume).count()
    real_mail_resumes = db.query(Resume).filter(
        or_(
            Resume.source == "boss_mail",
            Resume.source_message_id.isnot(None),
            Resume.source_attachment_hash.isnot(None),
        )
    ).count()

    print(f"Total Resumes: {total_resumes}")
    print(f"Real Mail Resumes: {real_mail_resumes}")

    # Demo resumes are those NOT from mail or associated with demo positions
    demo_resumes = db.query(Resume).filter(
        or_(
            Resume.source != "boss_mail",
            Resume.source.is_(None),
            Resume.position_id.in_(demo_position_ids) if demo_position_ids else False
        )
    ).all()

    # Exclude resumes that have source_attachment_hash matching ResumeMailImport
    mail_hashes = set(x[0] for x in db.query(ResumeMailImport.attachment_sha256).all() if x[0])
    mail_message_ids = set(x[0] for x in db.query(ResumeMailImport.message_id).all() if x[0])

    real_resumes_to_keep = []
    demo_resumes_to_delete = []

    all_resumes = db.query(Resume).all()
    for r in all_resumes:
        if (r.source_attachment_hash and r.source_attachment_hash in mail_hashes) or \
           (r.source_message_id and r.source_message_id in mail_message_ids) or \
           (r.source == "boss_mail"):
            real_resumes_to_keep.append(r)
        else:
            demo_resumes_to_delete.append(r)

    print(f"Real Resumes to Keep: {len(real_resumes_to_keep)}")
    print(f"Demo Resumes to Delete: {len(demo_resumes_to_delete)}")
    for dr in demo_resumes_to_delete:
        print(f"Deleting Demo Resume: {dr.id} - {dr.candidate_name}")

    demo_resume_ids = [r.id for r in demo_resumes_to_delete]
    conn = db.connection().connection
    cursor = conn.cursor()

    if demo_resume_ids:
        rids_str = ",".join(f"'{rid}'" for rid in demo_resume_ids)
        
        # Order tables from child to parent
        cursor.execute(f"DELETE FROM coding_submissions WHERE coding_test_id IN (SELECT id FROM coding_tests WHERE resume_id IN ({rids_str}))")
        cursor.execute(f"DELETE FROM coding_tests WHERE resume_id IN ({rids_str})")
        cursor.execute(f"DELETE FROM interview_panels WHERE interview_id IN (SELECT id FROM interviews WHERE resume_id IN ({rids_str}))")
        cursor.execute(f"DELETE FROM interviews WHERE resume_id IN ({rids_str})")
        cursor.execute(f"DELETE FROM department_reviews WHERE resume_id IN ({rids_str})")
        cursor.execute(f"DELETE FROM offers WHERE resume_id IN ({rids_str})")
        
        # Clear nullable references
        cursor.execute(f"UPDATE resume_mail_imports SET resume_id = NULL WHERE resume_id IN ({rids_str})")
        cursor.execute(f"UPDATE knowledge_assets SET source_resume_id = NULL WHERE source_resume_id IN ({rids_str})")

        # Delete demo resumes
        cursor.execute(f"DELETE FROM resumes WHERE id IN ({rids_str})")

    # Clean up demo positions
    if demo_position_ids:
        pids_str = ",".join(f"'{pid}'" for pid in demo_position_ids)
        real_pos = db.query(Position).filter(~Position.id.in_(demo_position_ids)).first()
        if real_pos:
            cursor.execute(f"UPDATE resumes SET position_id = '{real_pos.id}' WHERE position_id IN ({pids_str})")
            cursor.execute(f"UPDATE resume_mail_imports SET position_id = '{real_pos.id}' WHERE position_id IN ({pids_str})")
        else:
            cursor.execute(f"UPDATE resumes SET position_id = NULL WHERE position_id IN ({pids_str})")
            cursor.execute(f"UPDATE resume_mail_imports SET position_id = NULL WHERE position_id IN ({pids_str})")

        try:
            cursor.execute(f"UPDATE question_banks SET position_id = NULL WHERE position_id IN ({pids_str})")
        except Exception:
            pass

        cursor.execute(f"DELETE FROM positions WHERE id IN ({pids_str})")

    conn.commit()
    print("\nSuccessfully cleaned up all demo positions and demo resumes!")
    print(f"Remaining real positions: {[p.title for p in db.query(Position).all()]}")
    print(f"Remaining real resumes total count: {db.query(Resume).count()}")


if __name__ == "__main__":
    from app.config.database import SessionLocal
    db = SessionLocal()
    try:
        inspect_and_clean_demo_data(db)
    finally:
        db.close()
