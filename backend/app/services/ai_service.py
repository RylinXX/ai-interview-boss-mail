from openai import OpenAI
import os
from typing import Dict, Any
import json
import httpx
import base64
from dotenv import load_dotenv
from app.config.resume_industry import resume_industry_taxonomy_text
from app.utils.prompt_manager import prompt_manager
from app.config.database import SessionLocal
from app.models.models import SystemConfig

load_dotenv()

_DEFAULT_PROVIDER = os.getenv("LLM_PROVIDER", "dashscope")
_DEFAULT_BASE_URL = os.getenv("OPENAI_BASE_URL") or os.getenv("LLM_BASE_URL") or "https://dashscope.aliyuncs.com/compatible-mode/v1"
_DEFAULT_MODEL = os.getenv("OPENAI_MODEL") or os.getenv("LLM_MODEL") or "qwen3.5-plus"
_DEFAULT_TEMPERATURE = 0.2
_DEFAULT_BASE_URL_BY_PROVIDER = {
    "dashscope": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "openai": "https://api.openai.com/v1",
    "openai_compatible": None,
}

_client_cache = None
_client_cache_key = None


def _normalize_llm_base_url(base_url: str | None) -> str | None:
    value = (base_url or "").strip().rstrip("/")
    if not value:
        return None

    endpoint_suffixes = ("/chat/completions", "/responses")
    changed = True
    while changed:
        changed = False
        lower_value = value.lower()
        for suffix in endpoint_suffixes:
            if lower_value.endswith(suffix):
                value = value[: -len(suffix)].rstrip("/")
                changed = True
                break
    return value or None


def _get_llm_config() -> Dict[str, Any]:
    db = SessionLocal()
    try:
        cfg = db.query(SystemConfig).first()
        llm_provider = (cfg.llm_provider if cfg else None) or _DEFAULT_PROVIDER
        llm_base_url = (cfg.llm_base_url if cfg else None) or _DEFAULT_BASE_URL_BY_PROVIDER.get(llm_provider) or _DEFAULT_BASE_URL
        llm_base_url = _normalize_llm_base_url(llm_base_url)
        llm_model = (cfg.llm_model if cfg else None) or _DEFAULT_MODEL
        llm_temperature = (cfg.llm_temperature if cfg and cfg.llm_temperature is not None else None)
        llm_temperature = _DEFAULT_TEMPERATURE if llm_temperature is None else llm_temperature
        llm_max_tokens = cfg.llm_max_tokens if cfg else None
        llm_api_key = (cfg.llm_api_key if cfg else None) or os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY")
        return {
            "llm_provider": llm_provider,
            "llm_base_url": llm_base_url,
            "llm_model": llm_model,
            "llm_temperature": llm_temperature,
            "llm_max_tokens": llm_max_tokens,
            "llm_api_key": llm_api_key,
        }
    finally:
        db.close()


def _get_client() -> OpenAI:
    global _client_cache, _client_cache_key
    cfg = _get_llm_config()
    key = (cfg.get("llm_base_url"), cfg.get("llm_api_key"))
    if _client_cache is not None and _client_cache_key == key:
        return _client_cache
    _client_cache_key = key
    _client_cache = OpenAI(
        api_key=cfg.get("llm_api_key"),
        base_url=cfg.get("llm_base_url"),
    )
    return _client_cache

def _get_extra_body() -> Dict[str, Any]:
    cfg = _get_llm_config()
    base_url = (cfg.get("llm_base_url") or "").lower()
    if cfg.get("llm_provider") == "dashscope" and "dashscope.aliyuncs.com" in base_url:
        return {"enable_thinking": False}
    return {}


def _supports_json_response_format(cfg: Dict[str, Any]) -> bool:
    provider = (cfg.get("llm_provider") or "").lower()
    base_url = (cfg.get("llm_base_url") or "").lower()

    if provider == "openai_compatible":
        return False

    if "volces.com" in base_url or "ark.cn-" in base_url:
        return False

    return True


def _completion_options(cfg: Dict[str, Any], json_response: bool = False) -> Dict[str, Any]:
    options = {"temperature": cfg.get("llm_temperature", _DEFAULT_TEMPERATURE)}
    if cfg.get("llm_max_tokens") is not None:
        options["max_tokens"] = cfg["llm_max_tokens"]
    if json_response and _supports_json_response_format(cfg):
        options["response_format"] = {"type": "json_object"}
    return options


def _parse_json_content(content: str) -> Any:
    text = (content or "").strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].strip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end < start:
            raise
        return json.loads(text[start:end + 1])


def _response_text(payload: Dict[str, Any]) -> str:
    if payload.get("output_text"):
        return payload["output_text"]

    parts = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            text = content.get("text") or content.get("output_text")
            if text:
                parts.append(text)
    return "\n".join(parts).strip()


def extract_resume_text_from_images(image_data_urls: list[str]) -> str:
    if not image_data_urls:
        return ""

    cfg = _get_llm_config()
    api_key = cfg.get("llm_api_key")
    base_url = (cfg.get("llm_base_url") or "").rstrip("/")
    if not api_key or not base_url:
        return ""

    content = [
        {"type": "input_image", "image_url": image_url}
        for image_url in image_data_urls
    ]
    content.append(
        {
            "type": "input_text",
            "text": (
                "请从这些简历图片中完整提取可读文本，按原始顺序输出。"
                "只输出简历正文，不要总结，不要添加 Markdown 代码块。"
            ),
        }
    )

    try:
        response = httpx.post(
            f"{base_url}/responses",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": cfg["llm_model"],
                "input": [{"role": "user", "content": content}],
            },
            timeout=300,
        )
        response.raise_for_status()
        return _response_text(response.json())
    except Exception as e:
        print(f"Resume image text extraction failed: {e}")
        return ""


def extract_resume_text_from_document(file_path: str) -> str:
    cfg = _get_llm_config()
    api_key = cfg.get("llm_api_key")
    base_url = (cfg.get("llm_base_url") or "").rstrip("/")
    if not api_key or not base_url:
        return ""

    try:
        with open(file_path, "rb") as file:
            encoded = base64.b64encode(file.read()).decode("ascii")
    except OSError as exc:
        print(f"Resume document read failed: {exc}")
        return ""

    filename = os.path.basename(file_path)
    lower_name = filename.lower()
    if lower_name.endswith(".pdf"):
        media_type = "application/pdf"
    elif lower_name.endswith(".docx"):
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    else:
        media_type = "application/octet-stream"

    try:
        response = httpx.post(
            f"{base_url}/responses",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": cfg["llm_model"],
                "input": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_file",
                                "filename": filename,
                                "file_data": f"data:{media_type};base64,{encoded}",
                            },
                            {
                                "type": "input_text",
                                "text": (
                                    "请完整读取这份简历文件，按原始顺序提取正文文本。"
                                    "只输出简历正文，不要总结，不要添加 Markdown 代码块。"
                                ),
                            },
                        ],
                    }
                ],
            },
            timeout=300,
        )
        response.raise_for_status()
        return _response_text(response.json())
    except Exception as e:
        print(f"Resume document text extraction failed: {e}")
        return ""


def analyze_resume_intelligence_from_document(file_path: str) -> Dict[str, Any]:
    prompt_data = prompt_manager.get_prompt("analyze_resume_intelligence_from_document")
    if not prompt_data.get("user"):
        print("Failed to load prompt for analyze_resume_intelligence_from_document")
        return {}

    cfg = _get_llm_config()
    api_key = cfg.get("llm_api_key")
    base_url = (cfg.get("llm_base_url") or "").rstrip("/")
    if not api_key or not base_url:
        return {}

    try:
        with open(file_path, "rb") as file:
            encoded = base64.b64encode(file.read()).decode("ascii")
    except OSError as exc:
        print(f"Resume document read failed: {exc}")
        return {}

    filename = os.path.basename(file_path)
    lower_name = filename.lower()
    if lower_name.endswith(".pdf"):
        media_type = "application/pdf"
    elif lower_name.endswith(".docx"):
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    else:
        media_type = "application/octet-stream"

    prompt_text = "\n\n".join(
        part
        for part in (prompt_data.get("system"), prompt_data.get("user"))
        if part
    )

    try:
        response = httpx.post(
            f"{base_url}/responses",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": cfg["llm_model"],
                "input": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_file",
                                "filename": filename,
                                "file_data": f"data:{media_type};base64,{encoded}",
                            },
                            {"type": "input_text", "text": prompt_text},
                        ],
                    }
                ],
            },
            timeout=300,
        )
        response.raise_for_status()
        return _parse_json_content(_response_text(response.json()))
    except Exception as e:
        print(f"Resume document intelligence analysis failed: {e}")
        return {}


def analyze_resume(resume_text: str, position_description: str, other_positions: str = "") -> Dict[str, Any]:
    prompt_data = prompt_manager.get_prompt(
        "analyze_resume",
        resume_text=resume_text,
        position_description=position_description,
        other_positions=other_positions
    )

    if not prompt_data.get("user"):
        print("Failed to load prompt for analyze_resume")
        return {}

    try:
        cfg = _get_llm_config()
        extra = _completion_options(cfg, json_response=True)
        completion = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {'role': 'system', 'content': prompt_data['system']},
                {'role': 'user', 'content': prompt_data['user']}
            ],
            extra_body=_get_extra_body(),
            **extra,
        )
        result = _parse_json_content(completion.choices[0].message.content)
        return result
    except Exception as e:
        print(f"AI analysis failed: {e}")
        return {}


def analyze_resume_intelligence(resume_text: str) -> Dict[str, Any]:
    prompt_data = prompt_manager.get_prompt(
        "analyze_resume_intelligence",
        resume_text=resume_text,
    )

    if not prompt_data.get("user"):
        print("Failed to load prompt for analyze_resume_intelligence")
        return {}

    try:
        cfg = _get_llm_config()
        extra = _completion_options(cfg, json_response=True)
        completion = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {"role": "system", "content": prompt_data["system"]},
                {"role": "user", "content": prompt_data["user"]},
            ],
            extra_body=_get_extra_body(),
            **extra,
        )
        return _parse_json_content(completion.choices[0].message.content)
    except Exception as e:
        print(f"Resume intelligence analysis failed: {e}")
        return {}


def analyze_resume_positioning(resume_text: str, resume_data: Dict[str, Any]) -> Dict[str, Any]:
    prompt_data = prompt_manager.get_prompt(
        "analyze_resume_positioning",
        resume_text=resume_text,
        resume_data=json.dumps(resume_data or {}, ensure_ascii=False, indent=2),
        industry_taxonomy=resume_industry_taxonomy_text(),
    )

    if not prompt_data.get("user"):
        print("Failed to load prompt for analyze_resume_positioning")
        return {}

    try:
        cfg = _get_llm_config()
        extra = _completion_options(cfg, json_response=True)
        completion = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {"role": "system", "content": prompt_data["system"]},
                {"role": "user", "content": prompt_data["user"]},
            ],
            extra_body=_get_extra_body(),
            **extra,
        )
        parsed = _parse_json_content(completion.choices[0].message.content)
        return parsed if isinstance(parsed, dict) else {}
    except Exception as e:
        print(f"Resume positioning analysis failed: {e}")
        return {}


def generate_solution_agent_response(agent_payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        cfg = _get_llm_config()
        payload_text = json.dumps(agent_payload, ensure_ascii=False, indent=2)
        citation_contract = (
            "Every recommended_solutions item must include cited_asset_ids and cited_citation_ids "
            "from knowledge_context.assets. Unsupported solution claims must be listed in "
            "unsupported_claims instead of being presented as supported facts."
        )
        system = (
            "你是一个行业解决方案智能体，擅长把人才库、项目库和公司经历转化成可落地的AI/数字化方案。"
            "请严格返回 JSON，不要添加额外说明。"
        )
        user = f"""请根据以下业务输入和知识库上下文，生成一份面向客户的方案草案。

要求：
1. 方案必须引用已有项目或公司经验作为依据，不要编造真实客户名称或财务数据。
2. 结合用户的行业、业务流程、痛点和目标，给出 2 到 4 个可落地方向。
3. 每个方向说明应用场景、业务价值、相关案例和落地步骤。
4. 如果信息不足，在 next_questions 中给出继续追问用户的问题。

请严格返回以下 JSON：
{{
  "title": "方案标题",
  "summary": "一段方案概述",
  "recommended_solutions": [
    {{
      "name": "方案名称",
      "scenario": "适用场景",
      "value": "业务价值",
      "related_cases": ["引用的项目或公司经验"],
      "implementation_steps": ["落地步骤"]
    }}
  ],
  "needed_capabilities": ["需要的人才或交付能力"],
  "risks": ["风险或前提条件"],
  "next_questions": ["继续追问用户的问题"]
}}

业务输入和知识库上下文：
{payload_text}"""
        extra = _completion_options(cfg, json_response=True)
        completion = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {"role": "system", "content": system},
                {"role": "system", "content": citation_contract},
                {"role": "user", "content": user},
            ],
            extra_body=_get_extra_body(),
            **extra,
        )
        parsed = _parse_json_content(completion.choices[0].message.content)
        return parsed if isinstance(parsed, dict) else {}
    except Exception as e:
        print(f"Solution agent generation failed: {e}")
        return {}


def generate_knowledge_asset_tags(asset_payload: Dict[str, Any]) -> Dict[str, Any]:
    prompt_data = prompt_manager.get_prompt(
        "tag_knowledge_asset",
        asset_payload=json.dumps(asset_payload, ensure_ascii=False, indent=2),
    )
    if not prompt_data.get("user"):
        return {}
    try:
        cfg = _get_llm_config()
        extra = _completion_options(cfg, json_response=True)
        completion = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {"role": "system", "content": prompt_data["system"]},
                {"role": "user", "content": prompt_data["user"]},
            ],
            extra_body=_get_extra_body(),
            **extra,
        )
        parsed = _parse_json_content(completion.choices[0].message.content)
        return parsed if isinstance(parsed, dict) else {}
    except Exception as e:
        print(f"Knowledge asset tagging failed: {e}")
        return {}


def generate_ai_product_manager_draft(draft_payload: Dict[str, Any]) -> Dict[str, Any]:
    prompt_data = prompt_manager.get_prompt(
        "generate_ai_product_manager_draft",
        draft_payload=json.dumps(draft_payload, ensure_ascii=False, indent=2),
    )
    if not prompt_data.get("user"):
        return {}
    try:
        cfg = _get_llm_config()
        extra = _completion_options(cfg, json_response=True)
        completion = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {"role": "system", "content": prompt_data["system"]},
                {"role": "user", "content": prompt_data["user"]},
            ],
            extra_body=_get_extra_body(),
            **extra,
        )
        parsed = _parse_json_content(completion.choices[0].message.content)
        return parsed if isinstance(parsed, dict) else {}
    except Exception as e:
        print(f"AI product manager draft failed: {e}")
        return {}


def generate_resume_markdown(resume_text: str) -> str:
    prompt_data = prompt_manager.get_prompt(
        "generate_resume_markdown", 
        resume_text=resume_text
    )
    
    if not prompt_data.get("user"):
        return resume_text
        
    try:
        cfg = _get_llm_config()
        extra = _completion_options(cfg)
        completion = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {'role': 'system', 'content': prompt_data['system']},
                {'role': 'user', 'content': prompt_data['user']}
            ],
            extra_body=_get_extra_body(),
            **extra,
        )
        content = completion.choices[0].message.content
        # Remove potential markdown code block markers
        content = content.replace("```markdown", "").replace("```", "").strip()
        return content
    except Exception as e:
        print(f"Markdown generation failed: {e}")
        return resume_text

def generate_interview_questions(
    resume_data: Dict,
    position_description: str,
    question_bank_content: str = "",
    count: int = 5,
    interview_category: str = "technical"
) -> list:
    # 面试类型描述映射
    category_descriptions = {
        "hr": "HR面试，主要考察候选人的综合素质、沟通能力、团队协作、职业规划、薪资期望等",
        "technical": "技术面试，主要考察候选人的专业技能、技术深度、问题解决能力、项目经验等",
        "manager": "主管面试，主要考察候选人的业务理解、团队管理、项目把控、跨部门协作等能力",
        "ceo": "CEO面试，主要考察候选人的战略思维、价值观匹配、行业洞察、长期发展潜力等",
        "comprehensive": "综合面试，全面考察候选人的技术能力、综合素质、发展潜力等各方面"
    }

    category_desc = category_descriptions.get(interview_category, category_descriptions["technical"])

    prompt_data = prompt_manager.get_prompt(
        "generate_interview_questions",
        resume_data=json.dumps(resume_data, ensure_ascii=False),
        position_description=position_description,
        question_bank_content=question_bank_content,
        count=count,
        interview_category=category_desc
    )

    if not prompt_data.get("user"):
        return []

    try:
        cfg = _get_llm_config()
        extra = _completion_options(cfg, json_response=True)
        completion = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {'role': 'system', 'content': prompt_data['system']},
                {'role': 'user', 'content': prompt_data['user']}
            ],
            extra_body=_get_extra_body(),
            **extra,
        )
        result = _parse_json_content(completion.choices[0].message.content)
        if isinstance(result, list):
            return result
        return result.get("questions", [])
    except Exception as e:
        print(f"Question generation failed: {e}")
        return []

def generate_interview_evaluation(
    questions: list, 
    scores: Dict[str, Any], 
    total_score: int,
    panel_details: str = "",
    transcripts: str = "" # New parameter for candidate audio transcripts
) -> Dict[str, str]:
    prompt_data = prompt_manager.get_prompt(
        "generate_interview_evaluation", 
        questions=json.dumps(questions, ensure_ascii=False), 
        scores=json.dumps(scores, ensure_ascii=False),
        total_score=total_score,
        panel_details=panel_details,
        transcripts=transcripts
    )
    
    if not prompt_data.get("user"):
        return {"evaluation": "生成评价失败", "suggestion": "waitlist"}
        
    try:
        cfg = _get_llm_config()
        extra = _completion_options(cfg, json_response=True)
        completion = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {'role': 'system', 'content': prompt_data['system']},
                {'role': 'user', 'content': prompt_data['user']}
            ],
            extra_body=_get_extra_body(),
            **extra,
        )
        result = _parse_json_content(completion.choices[0].message.content)
        return result
    except Exception as e:
        print(f"Evaluation generation failed: {e}")
        return {"evaluation": "生成评价失败", "suggestion": "waitlist"}


def generate_interview_evaluation_from_transcript(
    transcript: str,
    interviewer_evaluation: str,
    interviewer_score: int
) -> Dict[str, str]:
    """
    根据录音转写和面试官评价生成综合评价
    """
    prompt_data = prompt_manager.get_prompt(
        "generate_interview_evaluation_from_transcript",
        transcript=transcript,
        interviewer_evaluation=interviewer_evaluation,
        interviewer_score=interviewer_score
    )
    
    if not prompt_data.get("user"):
        return {"evaluation": interviewer_evaluation, "suggestion": "waitlist"}
        
    try:
        cfg = _get_llm_config()
        extra = _completion_options(cfg, json_response=True)
        completion = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {'role': 'system', 'content': prompt_data['system']},
                {'role': 'user', 'content': prompt_data['user']}
            ],
            extra_body=_get_extra_body(),
            **extra,
        )
        result = _parse_json_content(completion.choices[0].message.content)
        return result
    except Exception as e:
        print(f"Evaluation from transcript generation failed: {e}")
        return {"evaluation": interviewer_evaluation, "suggestion": "waitlist"}


def generate_coding_test_evaluation(
    title: str,
    description: str,
    language: str,
    code: str,
    run_result: Dict[str, Any],
) -> Dict[str, Any]:
    prompt_data = prompt_manager.get_prompt(
        "generate_coding_test_evaluation",
        title=title,
        description=description,
        language=language,
        code=code,
        run_result=json.dumps(run_result, ensure_ascii=False),
    )

    if not prompt_data.get("user"):
        return {"evaluation": "生成评价失败"}

    try:
        cfg = _get_llm_config()
        extra = _completion_options(cfg, json_response=True)
        completion = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {"role": "system", "content": prompt_data["system"]},
                {"role": "user", "content": prompt_data["user"]},
            ],
            extra_body=_get_extra_body(),
            **extra,
        )
        result = _parse_json_content(completion.choices[0].message.content)
        return result
    except Exception as e:
        print(f"Coding evaluation generation failed: {e}")
        return {"evaluation": "生成评价失败"}

def generate_jd(
    title: str,
    department: str = "",
    location: str = "",
    salary_range: str = "",
    keywords: str = ""
) -> Dict[str, str]:
    prompt_data = prompt_manager.get_prompt(
        "generate_jd",
        title=title,
        department=department or "未指定",
        location=location or "未指定",
        salary_range=salary_range or "面议",
        keywords=keywords or "无特殊要求"
    )
    
    if not prompt_data.get("user"):
        return {"description": "生成岗位描述失败", "requirements": "生成任职要求失败"}
    
    try:
        cfg = _get_llm_config()
        extra = _completion_options(cfg, json_response=True)
        completion = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {'role': 'system', 'content': prompt_data['system']},
                {'role': 'user', 'content': prompt_data['user']}
            ],
            extra_body=_get_extra_body(),
            **extra,
        )
        result = _parse_json_content(completion.choices[0].message.content)
        return {
            "description": result.get("description", ""),
            "requirements": result.get("requirements", "")
        }
    except Exception as e:
        print(f"JD generation failed: {e}")
        return {"description": "生成岗位描述失败", "requirements": "生成任职要求失败"}

def generate_jd_stream(
    title: str,
    department: str = "",
    location: str = "",
    salary_range: str = "",
    keywords: str = ""
):
    prompt_data = prompt_manager.get_prompt(
        "generate_jd",
        title=title,
        department=department or "未指定",
        location=location or "未指定",
        salary_range=salary_range or "面议",
        keywords=keywords or "无特殊要求"
    )
    
    if not prompt_data.get("user"):
        yield "data: " + json.dumps({"error": "生成失败，请检查配置"}, ensure_ascii=False) + "\n\n"
        return
    
    try:
        cfg = _get_llm_config()
        extra = _completion_options(cfg, json_response=True)
        extra["stream"] = True
        
        stream = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {'role': 'system', 'content': prompt_data['system']},
                {'role': 'user', 'content': prompt_data['user']}
            ],
            extra_body=_get_extra_body(),
            **extra,
        )
        
        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield "data: " + json.dumps({"content": chunk.choices[0].delta.content}, ensure_ascii=False) + "\n\n"
        
        yield "data: " + json.dumps({"done": True}, ensure_ascii=False) + "\n\n"
    except Exception as e:
        print(f"JD stream generation failed: {e}")
        yield "data: " + json.dumps({"error": str(e)}, ensure_ascii=False) + "\n\n"

def chat_jd_stream(
    messages: list,
    current_description: str = "",
    current_requirements: str = ""
):
    system_prompt = """你是一个专业的招聘专家，擅长撰写和优化岗位描述（JD）。

当前岗位描述内容：
【岗位职责】
""" + current_description + """

【任职要求】
""" + current_requirements + """

你的任务是帮助用户优化和完善岗位描述。请根据用户的反馈进行修改，并返回完整的更新后的内容。

返回格式必须是 JSON：
{
  "description": "更新后的岗位职责（Markdown格式）",
  "requirements": "更新后的任职要求（Markdown格式）"
}

注意：
1. 保持专业性和准确性
2. 如果用户只是提问而不需要修改，请解释相关内容，但仍然返回当前的 description 和 requirements
3. 修改时要保持整体结构完整，不要只返回部分内容"""

    try:
        cfg = _get_llm_config()
        extra = _completion_options(cfg, json_response=True)
        extra["stream"] = True
        
        formatted_messages = [{"role": "system", "content": system_prompt}]
        for msg in messages:
            formatted_messages.append({"role": msg["role"], "content": msg["content"]})
        
        stream = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=formatted_messages,
            extra_body=_get_extra_body(),
            **extra,
        )
        
        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield "data: " + json.dumps({"content": chunk.choices[0].delta.content}, ensure_ascii=False) + "\n\n"
        
        yield "data: " + json.dumps({"done": True}, ensure_ascii=False) + "\n\n"
    except Exception as e:
        print(f"JD chat stream failed: {e}")
        yield "data: " + json.dumps({"error": str(e)}, ensure_ascii=False) + "\n\n"


def generate_text(prompt: str) -> str:
    """
    通用文本生成函数，用于生成面试评价等文本内容
    """
    try:
        cfg = _get_llm_config()
        extra = _completion_options(cfg)

        completion = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {'role': 'user', 'content': prompt}
            ],
            extra_body=_get_extra_body(),
            **extra,
        )
        return completion.choices[0].message.content
    except Exception as e:
        print(f"Text generation failed: {e}")
        return ""
