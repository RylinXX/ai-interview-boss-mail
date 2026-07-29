import re
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from app.models.models import Resume, Position, PositionStatus, ResumeMailImport
from app.services.resume_mail_import_parser import extract_boss_position_title


def extract_position_from_resume(resume: Resume, mail_import: ResumeMailImport = None) -> str:
    # 1. From Mail Import subject or filename
    if mail_import:
        title = extract_boss_position_title(mail_import.subject, None)
        if title:
            return title
        if mail_import.attachment_filename:
            m = re.search(r"【\s*([^_】]+)", mail_import.attachment_filename)
            if m:
                return m.group(1).strip()

    # 2. From file_path if it contains BOSS attachment pattern
    if resume.file_path:
        m = re.search(r"【\s*([^_】]+)", resume.file_path)
        if m:
            return m.group(1).strip()

    # 3. From raw_text or parsed_data
    text = (resume.raw_text or "")
    if isinstance(resume.parsed_data, dict):
        text += " " + str(resume.parsed_data.get("objective") or "")
        text += " " + str(resume.parsed_data.get("target_position") or "")
        text += " " + str(resume.parsed_data.get("experience_summary") or "")

    patterns = [
        r"(?:应聘|求职意向|意向岗位|目标岗位|期望职位)[:：\s]\s*([^\n\r,，|【\]]{2,15})",
        r"【\s*([^_】]{2,15})_[^】]*】"
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            title = m.group(1).strip()
            # filter out invalid non-position words
            if len(title) >= 2 and not any(k in title for k in ["北京", "上海", "广州", "深圳", "10K", "15K", "20K", "男", "女", "全职"]):
                return title

    return None


def run_backfill(db):
    resumes_without_pos = db.query(Resume).filter(Resume.position_id.is_(None)).all()
    print(f"Total resumes without position: {len(resumes_without_pos)}")

    updated = 0
    created_positions = {}

    for r in resumes_without_pos:
        mail_imp = None
        if r.source_attachment_hash:
            mail_imp = db.query(ResumeMailImport).filter(ResumeMailImport.attachment_sha256 == r.source_attachment_hash).first()
        if not mail_imp:
            mail_imp = db.query(ResumeMailImport).filter(ResumeMailImport.resume_id == r.id).first()

        title = extract_position_from_resume(r, mail_imp)
        if not title:
            continue

        clean_title = title.strip()
        # Find or create Position
        pos = db.query(Position).filter(func.lower(Position.title) == clean_title.lower()).first()
        if not pos:
            # check substring
            all_pos = db.query(Position).all()
            for p in all_pos:
                if p.title and (p.title.lower() in clean_title.lower() or clean_title.lower() in p.title.lower()):
                    pos = p
                    break

        if not pos:
            if clean_title not in created_positions:
                pos = Position(
                    title=clean_title,
                    department="通用招聘",
                    description=f"自动补充的岗位：{clean_title}",
                    requirements="从履历样本推导关联",
                    status=PositionStatus.OPEN,
                )
                db.add(pos)
                db.flush()
                created_positions[clean_title] = pos
            else:
                pos = created_positions[clean_title]

        r.position_id = pos.id
        if mail_imp and not mail_imp.position_id:
            mail_imp.position_id = pos.id
        updated += 1

    db.commit()
    print(f"Successfully backfilled positions for {updated} resumes!")
    print(f"Newly created positions: {list(created_positions.keys())}")


if __name__ == "__main__":
    from app.config.database import SessionLocal
    db = SessionLocal()
    try:
        run_backfill(db)
    finally:
        db.close()
