from app.services import task_queue


def test_resume_parse_concurrency_uses_environment(monkeypatch):
    monkeypatch.setenv("RESUME_PARSE_MAX_CONCURRENT", "8")

    assert task_queue.get_configured_max_concurrent(default=3) == 8


def test_resume_parse_concurrency_falls_back_for_invalid_values(monkeypatch):
    monkeypatch.setenv("RESUME_PARSE_MAX_CONCURRENT", "0")

    assert task_queue.get_configured_max_concurrent(default=3) == 3
