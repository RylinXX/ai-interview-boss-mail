from app.services.ai_service import _completion_options, _parse_json_content


def test_openai_compatible_provider_does_not_force_json_response_format():
    options = _completion_options(
        {
            "llm_provider": "openai_compatible",
            "llm_temperature": 0.2,
            "llm_max_tokens": None,
        },
        json_response=True,
    )

    assert options == {"temperature": 0.2}


def test_openai_provider_keeps_json_response_format_for_openai_base_url():
    options = _completion_options(
        {
            "llm_provider": "openai",
            "llm_base_url": "https://api.openai.com/v1",
            "llm_temperature": 0.2,
            "llm_max_tokens": 1000,
        },
        json_response=True,
    )

    assert options == {
        "temperature": 0.2,
        "max_tokens": 1000,
        "response_format": {"type": "json_object"},
    }


def test_volcengine_ark_base_url_does_not_force_json_response_format():
    options = _completion_options(
        {
            "llm_provider": "openai",
            "llm_base_url": "https://ark.cn-beijing.volces.com/api/v3",
            "llm_temperature": 0.2,
            "llm_max_tokens": None,
        },
        json_response=True,
    )

    assert options == {"temperature": 0.2}


def test_parse_json_content_handles_markdown_fence():
    content = '```json\n{"name": "candidate", "score": 88}\n```'

    assert _parse_json_content(content) == {"name": "candidate", "score": 88}
