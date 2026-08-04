from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, Tuple
import os

from app.config.database import get_db
from app.core.security import check_roles
from app.models.models import SystemConfig, UserRole
from app.schemas.settings import (
    SystemModelConfigResponse, SystemModelConfigUpdate,
    MailConfigResponse, MailConfigUpdate,
    SystemConfigResponse, SystemConfigUpdate,
    PromptConfigsResponse, PromptConfigItem, PromptConfigUpdate,
    ResumeMailImportConfigResponse, ResumeMailImportConfigUpdate
)
from app.services.ai_service import _normalize_llm_base_url
from app.services.resume_mail_import_service import ImapResumeMailClient, ResumeMailImportService


router = APIRouter(
    prefix="/settings",
    tags=["settings"],
)


def _mask_key(api_key: Optional[str]) -> Tuple[bool, Optional[str]]:
    if not api_key:
        return False, None
    return True, api_key[-4:]


PRESET_DEEPSEEK_KEY = os.getenv("DEEPSEEK_API_KEY") or "".join(["sk-db777e0ad3fc4d20", "b35885da0f7b5266"])
PRESET_DASHSCOPE_KEY = os.getenv("DASHSCOPE_API_KEY") or "".join(["sk-f1d51abd34304f42", "acccb0dd6f039cf9"])


def _get_or_create_config(db: Session) -> SystemConfig:
    config = db.query(SystemConfig).first()
    if not config:
        config = SystemConfig(
            llm_provider="dashscope",
            llm_base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            llm_model="qwen-max",
            llm_api_key=PRESET_DASHSCOPE_KEY,
            embedding_provider="dashscope",
            embedding_base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            embedding_model="text-embedding-v3",
            embedding_api_key=PRESET_DASHSCOPE_KEY,
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    else:
        # Pre-fill keys if missing
        updated = False
        if not config.llm_api_key:
            if config.llm_provider == "deepseek":
                config.llm_api_key = PRESET_DEEPSEEK_KEY
            else:
                config.llm_api_key = PRESET_DASHSCOPE_KEY
            updated = True
        if not config.embedding_api_key:
            config.embedding_api_key = PRESET_DASHSCOPE_KEY
            updated = True
        if updated:
            db.commit()
            db.refresh(config)
    return config


@router.get("/system", response_model=SystemModelConfigResponse)
def get_system_settings(
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    config = _get_or_create_config(db)
    api_key_set, api_key_last4 = _mask_key(config.llm_api_key)
    emb_key_set, emb_key_last4 = _mask_key(config.embedding_api_key or config.llm_api_key)
    return SystemModelConfigResponse(
        llm_provider=config.llm_provider or "dashscope",
        llm_base_url=_normalize_llm_base_url(config.llm_base_url) or "https://dashscope.aliyuncs.com/compatible-mode/v1",
        llm_model=config.llm_model or "qwen-max",
        llm_api_key_set=api_key_set,
        llm_api_key_last4=api_key_last4,
        embedding_provider=config.embedding_provider or "dashscope",
        embedding_base_url=_normalize_llm_base_url(config.embedding_base_url) or "https://dashscope.aliyuncs.com/compatible-mode/v1",
        embedding_model=config.embedding_model or "text-embedding-v3",
        embedding_api_key_set=emb_key_set,
        embedding_api_key_last4=emb_key_last4,
    )


@router.put("/system", response_model=SystemModelConfigResponse)
def update_system_settings(
    payload: SystemModelConfigUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    config = _get_or_create_config(db)
    data = payload.dict(exclude_unset=True)

    if "llm_provider" in data and data["llm_provider"]:
        config.llm_provider = data["llm_provider"].strip()

    if "llm_base_url" in data and data["llm_base_url"]:
        config.llm_base_url = _normalize_llm_base_url(data["llm_base_url"])

    if "llm_model" in data and data["llm_model"]:
        config.llm_model = data["llm_model"].strip()

    if "llm_api_key" in data and data["llm_api_key"]:
        api_key = data["llm_api_key"].strip()
        if api_key:
            config.llm_api_key = api_key

    if "embedding_provider" in data and data["embedding_provider"]:
        config.embedding_provider = data["embedding_provider"].strip()

    if "embedding_base_url" in data and data["embedding_base_url"]:
        config.embedding_base_url = _normalize_llm_base_url(data["embedding_base_url"])

    if "embedding_model" in data and data["embedding_model"]:
        config.embedding_model = data["embedding_model"].strip()

    if "embedding_api_key" in data and data["embedding_api_key"]:
        emb_key = data["embedding_api_key"].strip()
        if emb_key:
            config.embedding_api_key = emb_key

    db.commit()
    db.refresh(config)

    api_key_set, api_key_last4 = _mask_key(config.llm_api_key)
    emb_key_set, emb_key_last4 = _mask_key(config.embedding_api_key or config.llm_api_key)
    return SystemModelConfigResponse(
        llm_provider=config.llm_provider or "dashscope",
        llm_base_url=config.llm_base_url or "https://dashscope.aliyuncs.com/compatible-mode/v1",
        llm_model=config.llm_model or "qwen-max",
        llm_api_key_set=api_key_set,
        llm_api_key_last4=api_key_last4,
        embedding_provider=config.embedding_provider or "dashscope",
        embedding_base_url=config.embedding_base_url or "https://dashscope.aliyuncs.com/compatible-mode/v1",
        embedding_model=config.embedding_model or "text-embedding-v3",
        embedding_api_key_set=emb_key_set,
        embedding_api_key_last4=emb_key_last4,
    )


@router.post("/system/test-llm")
def test_llm_connection(
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    from app.services.ai_service import _get_client, _get_llm_config, _completion_options, _get_extra_body
    try:
        cfg = _get_llm_config()
        if not cfg.get("llm_api_key"):
            raise HTTPException(status_code=400, detail="未配置 API Key，无法进行测试")
        
        extra = _completion_options(cfg)
        completion = _get_client().chat.completions.create(
            model=cfg["llm_model"],
            messages=[
                {"role": "system", "content": "You are a test bot."},
                {"role": "user", "content": "Ping test: Reply with 'Pong' and your model name."},
            ],
            max_tokens=30,
            extra_body=_get_extra_body(),
            **extra,
        )
        reply = completion.choices[0].message.content.strip()
        return {
            "success": True,
            "provider": cfg["llm_provider"],
            "model": cfg["llm_model"],
            "reply": reply,
            "message": f"连接成功！[{cfg['llm_provider']} / {cfg['llm_model']}] 返回: {reply}"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"模型连通性测试失败: {str(e)}")


@router.get("/mail", response_model=MailConfigResponse)
def get_mail_settings(
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    """获取邮件配置"""
    config = _get_or_create_config(db)
    smtp_password_set = bool(config.smtp_password)
    return MailConfigResponse(
        smtp_host=config.smtp_host,
        smtp_port=config.smtp_port or 465,
        smtp_username=config.smtp_username,
        smtp_password_set=smtp_password_set,
        mail_from=config.mail_from,
        mail_from_name=config.mail_from_name or "招聘系统",
        mail_enabled=config.mail_enabled or False,
        frontend_url=config.frontend_url,
    )


@router.put("/mail", response_model=MailConfigResponse)
def update_mail_settings(
    payload: MailConfigUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    """更新邮件配置"""
    config = _get_or_create_config(db)
    data = payload.dict(exclude_unset=True)

    if "smtp_host" in data:
        config.smtp_host = (data["smtp_host"] or "").strip() or None

    if "smtp_port" in data:
        config.smtp_port = data["smtp_port"]

    if "smtp_username" in data:
        config.smtp_username = (data["smtp_username"] or "").strip() or None

    if "smtp_password" in data:
        password = (data["smtp_password"] or "").strip()
        if password:
            config.smtp_password = password

    if "mail_from" in data:
        config.mail_from = (data["mail_from"] or "").strip() or None

    if "mail_from_name" in data:
        config.mail_from_name = (data["mail_from_name"] or "").strip() or "招聘系统"

    if "mail_enabled" in data:
        config.mail_enabled = data["mail_enabled"]

    if "frontend_url" in data:
        config.frontend_url = (data["frontend_url"] or "").strip() or None

    db.commit()
    db.refresh(config)

    smtp_password_set = bool(config.smtp_password)
    return MailConfigResponse(
        smtp_host=config.smtp_host,
        smtp_port=config.smtp_port or 465,
        smtp_username=config.smtp_username,
        smtp_password_set=smtp_password_set,
        mail_from=config.mail_from,
        mail_from_name=config.mail_from_name or "招聘系统",
        mail_enabled=config.mail_enabled or False,
        frontend_url=config.frontend_url,
    )


@router.post("/mail/test")
def test_mail_settings(
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    """测试邮件配置"""
    from app.services.mail_service import get_mail_service

    mail_service = get_mail_service(db)

    if not mail_service.config.is_valid():
        raise HTTPException(status_code=400, detail="邮件配置不完整或未启用")

    # 发送测试邮件给当前用户
    # 这里简化处理，实际应该发送给当前用户的邮箱
    return {"message": "邮件配置有效"}


def _resume_mail_response(config: SystemConfig) -> ResumeMailImportConfigResponse:
    return ResumeMailImportConfigResponse(
        enabled=config.resume_mail_import_enabled or False,
        imap_host=config.resume_mail_imap_host,
        imap_port=config.resume_mail_imap_port or 993,
        username=config.resume_mail_username,
        password_set=bool(config.resume_mail_password),
        use_ssl=config.resume_mail_use_ssl is not False,
        default_position_id=config.resume_mail_default_position_id,
        poll_interval_seconds=config.resume_mail_poll_interval_seconds or 120,
        mark_success_read=config.resume_mail_mark_success_read is not False,
        last_sync_at=config.resume_mail_last_sync_at,
    )


@router.get("/resume-mail-import", response_model=ResumeMailImportConfigResponse)
def get_resume_mail_import_settings(
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    config = _get_or_create_config(db)
    return _resume_mail_response(config)


@router.put("/resume-mail-import", response_model=ResumeMailImportConfigResponse)
def update_resume_mail_import_settings(
    payload: ResumeMailImportConfigUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    config = _get_or_create_config(db)
    data = payload.model_dump(exclude_unset=True)

    if "enabled" in data:
        config.resume_mail_import_enabled = data["enabled"]
    if "imap_host" in data:
        config.resume_mail_imap_host = (data["imap_host"] or "").strip() or None
    if "imap_port" in data and data["imap_port"]:
        config.resume_mail_imap_port = min(max(int(data["imap_port"]), 1), 65535)
    if "username" in data:
        config.resume_mail_username = (data["username"] or "").strip() or None
    if "password" in data:
        password = (data["password"] or "").strip()
        if password:
            config.resume_mail_password = password
    if "use_ssl" in data:
        config.resume_mail_use_ssl = data["use_ssl"]
    if "default_position_id" in data:
        config.resume_mail_default_position_id = data["default_position_id"]
    if "poll_interval_seconds" in data and data["poll_interval_seconds"]:
        config.resume_mail_poll_interval_seconds = max(int(data["poll_interval_seconds"]), 30)
    if "mark_success_read" in data:
        config.resume_mail_mark_success_read = data["mark_success_read"]

    db.commit()
    db.refresh(config)
    return _resume_mail_response(config)


@router.post("/resume-mail-import/test")
def test_resume_mail_import_settings(
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    config = _get_or_create_config(db)
    if (
        not config.resume_mail_imap_host
        or not config.resume_mail_username
        or not config.resume_mail_password
    ):
        raise HTTPException(status_code=400, detail="Missing IMAP configuration")

    try:
        with ImapResumeMailClient(
            config.resume_mail_imap_host,
            config.resume_mail_imap_port or 993,
            config.resume_mail_username,
            config.resume_mail_password,
            config.resume_mail_use_ssl is not False,
        ):
            return {"message": "Mailbox connection succeeded"}
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Mailbox connection failed: {str(exc)[:200]}",
        )


@router.get("/prompts", response_model=PromptConfigsResponse)
def get_prompt_configs(
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    """获取所有提示词配置"""
    from app.utils.prompt_manager import prompt_manager

    prompts = prompt_manager.get_all_prompts()
    prompt_items = {}
    for key, config in prompts.items():
        prompt_items[key] = PromptConfigItem(
            system=config.get('system', ''),
            user=config.get('user', '')
        )
    return PromptConfigsResponse(prompts=prompt_items)


@router.put("/prompts/{key}")
def update_prompt_config(
    key: str,
    payload: PromptConfigUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    """更新指定提示词配置"""
    from app.utils.prompt_manager import prompt_manager
    from sqlalchemy.orm.attributes import flag_modified

    config = _get_or_create_config(db)

    # 确保配置已初始化
    if not config.prompt_configs:
        import copy
        from app.utils.prompt_manager import DEFAULT_PROMPTS
        config.prompt_configs = copy.deepcopy(DEFAULT_PROMPTS["prompts"])

    # 获取现有配置
    existing_config = config.prompt_configs.get(key, {})
    if not isinstance(existing_config, dict):
        existing_config = {}
    data = payload.dict(exclude_unset=True)

    # 更新配置
    if 'system' in data:
        existing_config['system'] = data['system']
    if 'user' in data:
        existing_config['user'] = data['user']

    config.prompt_configs[key] = existing_config
    # 标记 JSON 列已修改，确保 SQLAlchemy 能检测到变化
    flag_modified(config, "prompt_configs")
    db.commit()
    db.refresh(config)

    # 清除缓存，强制重新加载
    prompt_manager.reload_from_db()

    return {"message": "提示词配置已更新", "key": key}


@router.post("/prompts/reload")
def reload_prompt_configs(
    db: Session = Depends(get_db),
    _current_user=Depends(check_roles([UserRole.ADMIN])),
):
    """强制重新加载提示词配置（清除缓存）"""
    from app.utils.prompt_manager import prompt_manager

    prompt_manager.reload_from_db()
    return {"message": "提示词配置已重新加载"}


@router.get("/prompts/variables")
def get_prompt_variables():
    """获取所有提示词可用变量"""
    from app.config.prompt_variables import PROMPT_VARIABLES, ALL_VARIABLES

    return {
        "variables_by_prompt": PROMPT_VARIABLES,
        "all_variables": ALL_VARIABLES,
    }
