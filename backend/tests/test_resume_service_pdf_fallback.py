from app.services import resume_service


def test_unreadable_pdf_text_detects_repeated_watermark():
    text = "\n".join(["e4d9703bec8d6b8c1HB72NS-F1ZRy4q4UvyeWOGmnPPWMBRr1g~~"] * 12)

    assert resume_service._looks_like_unreadable_pdf_text(text) is True


def test_unreadable_pdf_text_keeps_normal_resume_text():
    text = """
    肖尧
    电话：15011427040
    AI产品经理
    熟悉 LLM、RAG、Agent 产品方案设计与数据工程。
    """

    assert resume_service._looks_like_unreadable_pdf_text(text) is False


def test_read_file_content_uses_vision_fallback_for_unreadable_pdf(monkeypatch, tmp_path):
    pdf = tmp_path / "resume.pdf"
    pdf.write_bytes(b"%PDF-1.4")

    monkeypatch.setattr(
        resume_service,
        "_extract_pdf_text",
        lambda file_path: "\n".join(["e4d9703bec8d6b8c1HB72NS-F1ZRy4q4UvyeWOGmnPPWMBRr1g~~"] * 12),
    )
    monkeypatch.setattr(
        resume_service,
        "_render_pdf_pages_as_data_urls",
        lambda file_path: ["data:image/png;base64,abc"],
    )
    monkeypatch.setattr(
        resume_service,
        "extract_resume_text_from_images",
        lambda images: "肖尧\nAI产品经理\n熟悉大模型产品与数据工程。",
    )

    read_file_content = resume_service.read_file_content(str(pdf))
    assert read_file_content
    assert "肖尧" in read_file_content
    assert "AI产品经理" in read_file_content
