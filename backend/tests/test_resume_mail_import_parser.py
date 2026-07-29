import hashlib
from email.message import EmailMessage

from app.services.resume_mail_import_parser import (
    extract_boss_position_title,
    is_supported_resume_filename,
    parse_mail_message,
)


def build_message(
    subject: str, attachment_name: str = "resume.pdf", content: bytes = b"%PDF-1.4"
) -> bytes:
    message = EmailMessage()
    message["From"] = "BOSS直聘 <notice@example.com>"
    message["To"] = "recruiting@example.com"
    message["Subject"] = subject
    message["Message-ID"] = "<boss-message-parser-test>"
    message.set_content("候选人通过 BOSS直聘 投递了简历")
    message.add_attachment(
        content, maintype="application", subtype="pdf", filename=attachment_name
    )
    return message.as_bytes()


def build_inline_filename_message() -> bytes:
    message = EmailMessage()
    message["From"] = "BOSS直聘 <notice@example.com>"
    message["To"] = "recruiting@example.com"
    message["Subject"] = "王先生 | 10年以上，应聘 ai产品经理 | 北京12-22K【BOSS直聘】"
    message.set_content("候选人通过 BOSS直聘 投递了简历")
    message.add_attachment(
        b"inline-pdf",
        maintype="application",
        subtype="pdf",
        filename="inline-resume.pdf",
        disposition="inline",
    )
    return message.as_bytes()


def build_filename_without_disposition_message() -> bytes:
    message = EmailMessage()
    message["From"] = "BOSS直聘 <notice@example.com>"
    message["To"] = "recruiting@example.com"
    message["Subject"] = "王先生 | 10年以上，应聘 ai产品经理 | 北京12-22K【BOSS直聘】"
    message.set_content("候选人通过 BOSS直聘 投递了简历")
    part = EmailMessage()
    part.set_content(b"no-disposition-pdf", maintype="application", subtype="pdf")
    part.set_param("name", "no-disposition-resume.pdf", header="Content-Type")
    message.make_mixed()
    message.attach(part)
    return message.as_bytes()


def test_parse_mail_message_does_not_treat_normal_boss_sender_as_boss_zhipin():
    message = EmailMessage()
    message["From"] = "Team Boss <boss@example.com>"
    message["To"] = "recruiting@example.com"
    message["Subject"] = "Normal resume submission"
    message.set_content("Candidate submitted a normal resume.")
    message.add_attachment(
        b"%PDF-1.4", maintype="application", subtype="pdf", filename="resume.pdf"
    )

    parsed = parse_mail_message(message.as_bytes(), uid="557")

    assert parsed.is_boss_resume is False


def test_extract_boss_position_title_from_subject():
    subject = "袁承祥 | 4年，应聘 ai产品经理 | 北京12-22K【BOSS直聘】"

    assert extract_boss_position_title(subject) == "ai产品经理"


def test_supported_resume_filenames():
    assert is_supported_resume_filename("candidate.pdf") is True
    assert is_supported_resume_filename("candidate.docx") is True
    assert is_supported_resume_filename("candidate.txt") is True
    assert is_supported_resume_filename("candidate.png") is True
    assert is_supported_resume_filename("avatar.png") is False



def test_parse_mail_message_extracts_boss_attachment_and_hash():
    parsed = parse_mail_message(
        build_message("王先生 | 10年以上，应聘 ai产品经理 | 北京12-22K【BOSS直聘】"),
        uid="555",
    )

    assert parsed.uid == "555"
    assert parsed.message_id == "<boss-message-parser-test>"
    assert parsed.is_boss_resume is True
    assert parsed.position_title == "ai产品经理"
    assert len(parsed.attachments) == 1
    assert parsed.attachments[0].filename == "resume.pdf"
    assert parsed.attachments[0].sha256 == hashlib.sha256(b"%PDF-1.4").hexdigest()
    assert len(parsed.attachments[0].sha256) == 64


def test_parse_mail_message_keeps_unsupported_attachment_for_status_logging():
    parsed = parse_mail_message(
        build_message("李毅 | 7年，应聘 ai产品经理【BOSS直聘】", "avatar.png", b"png"),
        uid="556",
    )

    assert parsed.is_boss_resume is True
    assert len(parsed.attachments) == 1
    assert parsed.attachments[0].supported is False
    assert parsed.attachments[0].suffix == ".png"


def test_parse_mail_message_extracts_inline_part_with_filename():
    parsed = parse_mail_message(build_inline_filename_message(), uid="558")

    assert len(parsed.attachments) == 1
    assert parsed.attachments[0].filename == "inline-resume.pdf"
    assert parsed.attachments[0].content == b"inline-pdf"


def test_parse_mail_message_extracts_part_with_filename_without_disposition():
    parsed = parse_mail_message(build_filename_without_disposition_message(), uid="559")

    assert len(parsed.attachments) == 1
    assert parsed.attachments[0].filename == "no-disposition-resume.pdf"
    assert parsed.attachments[0].content == b"no-disposition-pdf"


def test_parse_mail_message_extracts_text_attachment_with_filename():
    message = EmailMessage()
    message["From"] = "BOSS直聘 <notice@example.com>"
    message["To"] = "recruiting@example.com"
    message["Subject"] = "王先生 | 10年以上，应聘 ai产品经理 | 北京12-22K【BOSS直聘】"
    message.set_content("候选人通过 BOSS直聘 投递了简历")
    message.add_attachment(
        "text resume", subtype="plain", filename="resume.txt"
    )

    parsed = parse_mail_message(message.as_bytes(), uid="561")

    assert len(parsed.attachments) == 1
    assert parsed.attachments[0].filename == "resume.txt"
    assert parsed.attachments[0].content == b"text resume\n"


def test_parse_mail_message_invalid_date_returns_none():
    message = EmailMessage()
    message["From"] = "BOSS直聘 <notice@example.com>"
    message["To"] = "recruiting@example.com"
    message["Subject"] = "王先生 | 10年以上，应聘 ai产品经理 | 北京12-22K【BOSS直聘】"
    message["Date"] = "not a valid date"
    message.set_content("候选人通过 BOSS直聘 投递了简历")

    parsed = parse_mail_message(message.as_bytes(), uid="560")

    assert parsed.received_at is None
