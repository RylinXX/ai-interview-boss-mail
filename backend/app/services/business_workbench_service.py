from typing import Any, Dict, List
from uuid import UUID

import re

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.models import (
    AIEmployeeRun,
    AIEmployeeRunStatus,
    CustomerProject,
    CustomerProjectStatus,
    KnowledgeAsset,
    ProjectTask,
    ProjectTaskStatus,
    Resume,
    SolutionAgentConversation,
    SolutionAgentMessage,
    SolutionAgentRun,
    SolutionDocument,
)
from app.schemas.business_workbench import (
    AgentSolutionProjectCreate,
    AIEmployeeChatRequest,
    CustomerProjectCreate,
    CustomerProjectUpdate,
    ProjectTaskUpdate,
)
from app.services.ai_service import generate_solution_agent_response


AI_EMPLOYEES = [
    {
        "employee_type": "business_analyst",
        "display_name": "业务分析师",
        "responsibility": "梳理客户现状、根因假设和待确认问题",
        "output_template": "诊断摘要 + 待确认问题",
        "status": "available",
    },
    {
        "employee_type": "industry_researcher",
        "display_name": "行业研究员",
        "responsibility": "补充行业模式和可参考业务路径",
        "output_template": "行业判断 + 对标模式",
        "status": "available",
    },
    {
        "employee_type": "product_manager",
        "display_name": "AI 产品经理",
        "responsibility": "把诊断转成方案模块、需求和路线图",
        "output_template": "方案模块 + PRD 要点",
        "status": "available",
    },
    {
        "employee_type": "operations_consultant",
        "display_name": "运营顾问",
        "responsibility": "设计流程优化、SOP 和交付机制",
        "output_template": "流程优化方案 + SOP 草案",
        "status": "available",
    },
    {
        "employee_type": "data_analyst",
        "display_name": "数据分析师",
        "responsibility": "设计指标、看板和验证方法",
        "output_template": "指标体系 + 验证计划",
        "status": "available",
    },
    {
        "employee_type": "implementation_planner",
        "display_name": "实施规划师",
        "responsibility": "拆解里程碑、风险和执行节奏",
        "output_template": "实施路线图 + 风险清单",
        "status": "available",
    },
]


def build_solution_content(project: CustomerProject) -> str:
    pain_points = "、".join(project.pain_points or []) or "待补充"
    goals = "、".join(project.goals or []) or "待补充"
    return (
        f"# {project.name}业务优化方案\n\n"
        f"## 客户背景\n行业：{project.industry or '待补充'}\n规模：{project.company_scale or '待补充'}\n\n"
        f"## 当前问题\n{pain_points}\n\n"
        f"## 优化目标\n{goals}\n\n"
        "## 初步路径\n围绕客户目标生成诊断任务、能力样本匹配任务和执行路线图任务。"
    )


_LIST_SPLIT_RE = re.compile(r"(?:\\r\\n|\\n|\\r|\r\n|\n|\r|,|，|;|；)")
_NUMBERED_PREFIX_RE = re.compile(r"^\s*(?:[-*]\s*)?(?:\d+\s*[\.\)、)]|[（(]\s*\d+\s*[）)]|[一二三四五六七八九十]+[、.])\s*")


def _clean_numbered_text(value: Any) -> str:
    return _NUMBERED_PREFIX_RE.sub("", str(value or "").strip()).strip()


def _string_list(value: Any) -> List[str]:
    if not value:
        return []
    if isinstance(value, list):
        parts: List[str] = []
        for item in value:
            parts.extend(_string_list(item))
        return parts
    return [item.strip() for item in _LIST_SPLIT_RE.split(str(value)) if item.strip()]


def _text_blob(*parts: Any) -> str:
    chunks: List[str] = []
    for part in parts:
        if part is None:
            continue
        if isinstance(part, dict):
            chunks.extend(str(value) for value in part.values() if value)
        elif isinstance(part, list):
            chunks.extend(str(value) for value in part if value)
        else:
            chunks.append(str(part))
    return " ".join(chunks)


def _search_terms(text: str) -> List[str]:
    normalized = str(text or "").lower()
    domain_terms = [
        "模板", "填报", "文档", "资质", "字段", "映射", "治理", "处置方案",
        "直播", "短视频", "电商", "销售", "增长", "投流", "私域",
        "审批", "流程", "知识库", "自动生成", "平台", "系统", "项目",
    ]
    terms = [term for term in domain_terms if term.lower() in normalized]
    terms.extend(
        token
        for token in re.split(r"[\s,，。；;、/|]+", normalized)
        if len(token) >= 2
    )
    return list(dict.fromkeys(terms))


def _score_text(text: str, terms: List[str]) -> int:
    return sum(1 for term in terms if term and term in text)


def _knowledge_asset_text(asset: KnowledgeAsset) -> str:
    return _text_blob(
        asset.title,
        asset.summary,
        asset.raw_text,
        asset.industry_tags,
        asset.business_topic_tags,
        asset.scenario_tags,
        asset.evidence_type_tags,
        asset.capability_tags,
        asset.methodology_tags,
        asset.customer_type_tags,
        asset.value_tags,
        asset.proves,
        asset.applicable_conditions,
        asset.migration_risks,
    ).lower()


def _knowledge_asset_context_row(asset: KnowledgeAsset, score: int) -> Dict[str, Any]:
    return {
        "asset_id": str(asset.id),
        "asset_title": asset.title,
        "title": asset.title,
        "source_type": asset.source_type,
        "summary": asset.summary,
        "raw_text": (asset.raw_text or "")[:900],
        "industry_tags": _string_list(asset.industry_tags),
        "business_topic_tags": _string_list(asset.business_topic_tags),
        "evidence_type_tags": _string_list(asset.evidence_type_tags),
        "capability_tags": _string_list(asset.capability_tags),
        "proves": _string_list(asset.proves),
        "does_not_prove": _string_list(asset.does_not_prove),
        "applicable_conditions": _string_list(asset.applicable_conditions),
        "migration_risks": _string_list(asset.migration_risks),
        "confidence_score": asset.confidence_score or 0,
        "score": score,
    }


def _related_evidence_titles(context: Dict[str, Any], limit: int = 3) -> List[str]:
    titles: List[str] = []
    titles.extend(case["project_name"] for case in context.get("project_cases", []) if case.get("project_name"))
    titles.extend(asset["asset_title"] for asset in context.get("knowledge_assets", []) if asset.get("asset_title"))
    return list(dict.fromkeys(titles))[:limit]


def _build_ai_employee_evidence_context(
    db: Session,
    payload: AIEmployeeChatRequest,
) -> Dict[str, Any]:
    query_text = _text_blob(
        payload.requirement,
        payload.company_profile,
        payload.project_materials,
        [message.content for message in payload.messages],
    ).lower()
    terms = _search_terms(query_text)
    safe_limit = max(1, min(int(payload.limit or 300), 1000))

    knowledge_types = payload.knowledge_types or []
    industries = payload.industries or []
    roles = payload.roles or []

    include_projects = not knowledge_types or "project_cases" in knowledge_types or "cases" in knowledge_types or "all" in knowledge_types
    include_resumes = not knowledge_types or "work_cases" in knowledge_types or "resumes" in knowledge_types or "all" in knowledge_types
    include_assets = not knowledge_types or "knowledge_assets" in knowledge_types or "assets" in knowledge_types or "all" in knowledge_types

    resumes_query = db.query(Resume).filter(Resume.parse_status == "success", Resume.parsed_data.isnot(None))
    if industries:
        ind_conds = [cast(Resume.parsed_data, String).ilike(f"%{ind}%") for ind in industries]
        resumes_query = resumes_query.filter(or_(*ind_conds))

    resumes = (
        resumes_query.order_by(Resume.created_at.desc(), Resume.id.desc())
        .limit(safe_limit)
        .all()
    )

    project_cases: List[Dict[str, Any]] = []
    work_cases: List[Dict[str, Any]] = []
    knowledge_assets: List[Dict[str, Any]] = []
    for resume in resumes:
        parsed = resume.parsed_data or {}
        logic_analysis = parsed.get("logic_analysis")
        if include_projects:
            for project in parsed.get("project_experiences") or []:
                if not isinstance(project, dict):
                    continue
                case_text = _text_blob(project, logic_analysis, resume.candidate_name).lower()
                score = _score_text(case_text, terms)
                if roles and not any(r.lower() in case_text for r in roles):
                    continue
                if terms and score <= 0:
                    continue
                project_cases.append(
                    {
                        "resume_id": str(resume.id),
                        "candidate_name": resume.candidate_name,
                        "project_name": project.get("name") or "未命名项目",
                        "role": project.get("role"),
                        "problem": project.get("problem"),
                        "solution": project.get("solution"),
                        "business_model": project.get("business_model"),
                        "score": score if terms else 10,
                    }
                )
        if include_resumes:
            for work in parsed.get("work_experiences") or []:
                if not isinstance(work, dict):
                    continue
                case_text = _text_blob(work, logic_analysis, resume.candidate_name).lower()
                score = _score_text(case_text, terms)
                if roles and not any(r.lower() in case_text for r in roles):
                    continue
                if terms and score <= 0:
                    continue
                work_cases.append(
                    {
                        "resume_id": str(resume.id),
                        "candidate_name": resume.candidate_name,
                        "company": work.get("company") or "未命名公司",
                        "role": work.get("role"),
                        "summary": work.get("summary"),
                        "capabilities": _string_list(work.get("capabilities")),
                        "score": score if terms else 10,
                    }
                )

    if include_assets:
        assets_query = db.query(KnowledgeAsset)
        if industries:
            ind_conds = [cast(KnowledgeAsset.industry_tags, String).ilike(f"%{ind}%") for ind in industries]
            assets_query = assets_query.filter(or_(*ind_conds))

        assets = (
            assets_query.order_by(KnowledgeAsset.updated_at.desc(), KnowledgeAsset.created_at.desc())
            .limit(safe_limit)
            .all()
        )
        for asset in assets:
            score = _score_text(_knowledge_asset_text(asset), terms)
            if terms and score <= 0:
                continue
            knowledge_assets.append(_knowledge_asset_context_row(asset, score if terms else 10))

    project_cases.sort(key=lambda item: item["score"], reverse=True)
    work_cases.sort(key=lambda item: item["score"], reverse=True)
    knowledge_assets.sort(
        key=lambda item: (item["score"], item.get("confidence_score") or 0),
        reverse=True,
    )
    return {
        "terms": terms,
        "project_cases": project_cases[:8],
        "work_cases": work_cases[:8],
        "knowledge_assets": knowledge_assets[:8],
        "candidate_count": len({item["resume_id"] for item in project_cases + work_cases}),
    }


def _format_standard_solution_markdown(payload: AIEmployeeChatRequest, solution: Dict[str, Any], context: Dict[str, Any]) -> str:
    llm_markdown = solution.get("assistant_message")
    if llm_markdown and isinstance(llm_markdown, str) and len(llm_markdown.strip()) > 30:
        return llm_markdown.strip()

    title = solution.get("title") or "AI 业务解决方案"
    summary = solution.get("summary") or "基于私有人才库档案与知识资产为您生成的深度解决方案。"

    project_cases = context.get("project_cases") or []
    work_cases = context.get("work_cases") or []
    knowledge_assets = context.get("knowledge_assets") or []

    md_lines = [
        f"### 🎯 一、 需求分析与方案定位：{title}",
        f"**客户咨询问题**: {payload.requirement.strip()}",
        f"**方案总结与定位**: {summary}\n",
        "### 💡 二、 核心交付方案与业务逻辑",
    ]

    rec_solutions = solution.get("recommended_solutions") or []
    for idx, item in enumerate(rec_solutions, start=1):
        md_lines.append(f"#### {idx}. {item.get('name', '系统实施方案方向')}")
        if item.get('scenario'):
            md_lines.append(f"- **适用业务场景**: {item.get('scenario')}")
        if item.get('value'):
            md_lines.append(f"- **核心商业价值**: {item.get('value')}")
        steps = item.get('implementation_steps') or []
        if steps:
            md_lines.append(f"- **落地实施步骤**: {' ➔ '.join(steps)}")
        md_lines.append("")

    md_lines.append("### 📚 三、 私有数据库线索与真实依据引述")
    cite_idx = 1
    if project_cases or work_cases or knowledge_assets:
        for p in project_cases[:3]:
            candidate = p.get('candidate_name', '专家')
            proj = p.get('project_name', '案例')
            model = p.get('business_model') or p.get('solution') or '沉淀打法'
            md_lines.append(f"- **[引用 {cite_idx}] 人才案例**: **{candidate}** - 《{proj}》（商业模式实操: {model}）")
            cite_idx += 1
        for w in work_cases[:2]:
            candidate = w.get('candidate_name', '专家')
            comp = w.get('company', '企业')
            role = w.get('role', '角色')
            capabilities = ', '.join(w.get('capabilities', [])[:3]) if w.get('capabilities') else '通用能力'
            md_lines.append(f"- **[引用 {cite_idx}] 履历档案**: **{candidate}** (曾任职于 **{comp}** {role}，具备 {capabilities}）")
            cite_idx += 1
        for k in knowledge_assets[:3]:
            asset_title = k.get('title') or k.get('source_name') or '知识资产'
            proves = ', '.join(k.get('proves', [])[:2]) if k.get('proves') else '行业证据'
            md_lines.append(f"- **[引用 {cite_idx}] 强证据知识资产**: 《{asset_title}》（证明维度: {proves}）")
            cite_idx += 1
    else:
        md_lines.append("- 当前私有数据库中未匹配到直接对标的过往案例，建议导入更多相关领域的能力样本档案。\n")

    md_lines.append("\n### ⚠️ 四、 假设前提与已知风险边界")
    risks = solution.get("risks") or ["方案上线前需要由人工审核确认客户真实业务范围", "关键口径与交付范围需与客户二次确认"]
    for r in risks:
        md_lines.append(f"- {r}")

    md_lines.append("\n### 🚀 五、 实施落地与交付拆解")
    next_q = solution.get("next_questions") or ["客户当前最优先希望先交付的成果模块是什么？", "是否已有历史数据或试点部门？"]
    for q in next_q:
        md_lines.append(f"- ❓ **追问建议**: {q}")

    return "\n".join(md_lines)


def _fallback_chat_solution(payload: AIEmployeeChatRequest, context: Dict[str, Any]) -> Dict[str, Any]:
    requirement = payload.requirement.strip()
    is_template = any(term in requirement for term in ["模板", "填报", "文档", "资质"])
    is_growth = any(term in requirement for term in ["直播", "短视频", "电商", "销售", "增长"])
    if is_template:
        return {
            "title": "模板型资料自动填报平台",
            "summary": "围绕官方模板、企业资料库、字段映射和人工审核形成自动填报系统。",
            "recommended_solutions": [
                {
                    "name": "模板采集与字段映射系统",
                    "scenario": "把不同区域或部门的官方模板统一入库并识别字段",
                    "value": "减少重复填写、格式错误和资料遗漏",
                    "related_cases": _related_evidence_titles(context),
                    "implementation_steps": ["模板入库", "字段字典", "资料库接入", "自动填报", "人工审核", "导出交付"],
                }
            ],
            "needed_capabilities": ["模板字段识别", "资料库治理", "文档自动生成"],
            "risks": ["官方模板口径需要人工确认", "企业资料真实性和使用范围需要人工审核"],
            "next_questions": ["客户是否已有结构化资质资料？", "模板是否存在多个区域版本？"],
        }
    if is_growth:
        return {
            "title": "内容销售增长方案",
            "summary": "结合过往电商、直播和增长经验，形成短视频直播销售策略与执行系统。",
            "recommended_solutions": [
                {
                    "name": "短视频直播增长工作台",
                    "scenario": "脚本生成、选品卖点、直播节奏、投流复盘和私域承接",
                    "value": "提升内容生产效率和销售转化复盘能力",
                    "related_cases": _related_evidence_titles(context),
                    "implementation_steps": ["定位人群", "生成脚本", "设计直播策略", "沉淀复盘看板"],
                }
            ],
            "needed_capabilities": ["直播运营", "内容策略", "数据复盘"],
            "risks": ["转化效果需要真实投放和直播数据验证"],
            "next_questions": ["当前产品客单价和目标人群是什么？", "是否已有历史直播数据？"],
        }
    return {
        "title": "客户需求 AI 解决方案",
        "summary": "基于已上传能力样本和客户资料，形成需求分析、系统方案和人工审核闭环。",
        "recommended_solutions": [
            {
                "name": "需求分析与执行工作台",
                "scenario": "客户需求整理、案例检索、方案生成和执行拆解",
                "value": "把过往人才经验转化为可交付方案",
                "related_cases": _related_evidence_titles(context),
                "implementation_steps": ["需求录入", "经验检索", "方案生成", "人工确认", "执行拆解"],
            }
        ],
        "needed_capabilities": ["需求分析", "方案设计", "执行拆解"],
        "risks": ["需要人工确认客户真实业务边界"],
        "next_questions": ["客户最希望先交付的成果是什么？"],
    }


def _build_dynamic_workers(solution: Dict[str, Any], requirement: str) -> List[Dict[str, str]]:
    generated_workers = solution.get("dynamic_workers")
    if isinstance(generated_workers, list) and generated_workers:
        return [
            {
                "name": str(item.get("name") or "AI 执行员工"),
                "responsibility": str(item.get("responsibility") or "根据方案承担具体执行任务"),
                "human_review": str(item.get("human_review") or "关键结论由人工审核确认"),
            }
            for item in generated_workers
            if isinstance(item, dict)
        ]

    if any(term in requirement for term in ["模板", "填报", "文档", "资质"]):
        return [
            {"name": "模板解析员工", "responsibility": "识别官方模板字段、格式和必填规则", "human_review": "人工确认字段口径和官方解释"},
            {"name": "资料抽取员工", "responsibility": "从公司资质、项目资料中抽取可填字段", "human_review": "人工确认资料真实性和适用范围"},
            {"name": "字段映射员工", "responsibility": "把资料字段匹配到模板字段并标记缺口", "human_review": "人工处理歧义字段和缺失资料"},
            {"name": "文档生成员工", "responsibility": "生成模板初稿、检查格式并导出", "human_review": "人工验收最终交付文档"},
        ]
    if any(term in requirement for term in ["直播", "短视频", "电商", "销售", "增长"]):
        return [
            {"name": "增长策略员工", "responsibility": "提炼人群、卖点、转化路径和直播节奏", "human_review": "人工确认品牌定位和预算边界"},
            {"name": "短视频脚本员工", "responsibility": "生成脚本、标题、分镜和素材清单", "human_review": "人工审核合规和品牌语气"},
            {"name": "投流复盘员工", "responsibility": "整理投放指标和复盘建议", "human_review": "人工决定预算调整"},
        ]
    return [
        {"name": "需求分析员工", "responsibility": "整理客户需求、约束和目标交付物", "human_review": "人工确认需求优先级"},
        {"name": "方案设计员工", "responsibility": "生成系统模块、实施路径和MVP边界", "human_review": "人工确认商业价值和范围"},
        {"name": "执行拆解员工", "responsibility": "拆分AI可做任务与人工决策任务", "human_review": "人工负责最终决策"},
    ]


def _human_decision_points(solution: Dict[str, Any], workers: List[Dict[str, str]]) -> List[str]:
    points = [
        "人工确认客户需求优先级、预算边界和交付范围",
        "人工审核AI引用的能力样本是否适合对外作为背书",
    ]
    points.extend(_string_list(solution.get("risks"))[:3])
    points.extend(worker["human_review"] for worker in workers if worker.get("human_review"))
    return list(dict.fromkeys(points))


def chat_with_ai_employee(db: Session, payload: AIEmployeeChatRequest, user_id: Optional[UUID] = None) -> Dict[str, Any]:
    context = _build_ai_employee_evidence_context(db, payload)
    llm_payload = {
        "user_profile": {
            "requirement": payload.requirement,
            "company_profile": payload.company_profile,
            "project_materials": payload.project_materials,
            "conversation": [message.model_dump() for message in payload.messages],
        },
        "knowledge_context": {
            "project_cases": context["project_cases"],
            "work_cases": context["work_cases"],
            "knowledge_assets": context["knowledge_assets"],
            "candidate_count": context["candidate_count"],
        },
        "instruction": (
            "你是一个专业的 AI 解决方案顾问。请严格按照以下六段式结构输出深度解决方案：\n"
            "一、客户痛点诊断\n"
            "二、核心打法与业务逻辑\n"
            "三、落地执行路径（阶段/步骤）\n"
            "四、匹配专家/人才推荐\n"
            "五、参考案例与数据依据（引用私有知识库）\n"
            "六、已知风险与注意事项\n"
            "强调无引用不编造，观点与建议须有真实私有资产支撑。"
        ),
    }
    generated = generate_solution_agent_response(llm_payload)
    fallback_used = not bool(generated)
    solution = generated or _fallback_chat_solution(payload, context)
    workers = _build_dynamic_workers(solution, payload.requirement)
    human_points = _human_decision_points(solution, workers)
    solution = {
        "title": solution.get("title") or "AI 业务解决方案",
        "summary": solution.get("summary") or "",
        "recommended_solutions": solution.get("recommended_solutions") or [],
        "needed_capabilities": _string_list(solution.get("needed_capabilities")),
        "risks": _string_list(solution.get("risks")),
        "next_questions": _string_list(solution.get("next_questions")),
        "knowledge_context": {
            "project_count": context.get("retrieved_project_count", len(context["project_cases"])),
            "work_count": len(context["work_cases"]),
            "knowledge_asset_count": len(context["knowledge_assets"]),
            "candidate_count": context["candidate_count"],
            "project_cases": context["project_cases"][:6],
            "work_cases": context["work_cases"][:6],
            "knowledge_assets": context["knowledge_assets"][:6],
        },
        "dynamic_workers": workers,
    }
    assistant_message = _format_standard_solution_markdown(payload, solution, context)
    retrieved_evidence = context["knowledge_assets"][:4] + context["project_cases"][:6] + context["work_cases"][:4]

    conversation_id = None
    if user_id:
        from app.services import knowledge_asset_service
        try:
            persisted = knowledge_asset_service._persist_solution_agent_interaction(
                db,
                payload=knowledge_asset_service.SolutionAgentRequest(
                    requirement=payload.requirement,
                    search_scope="all",
                ),
                result={
                    "assistant_message": assistant_message,
                    "solution": solution,
                    "retrieved_evidence": retrieved_evidence,
                    "model_used": not fallback_used,
                    "fallback_used": fallback_used,
                },
                user_id=user_id,
            )
            conversation_id = persisted.get("conversation_id")
        except Exception:
            pass

    return {
        "conversation_id": conversation_id,
        "assistant_message": assistant_message,
        "solution": solution,
        "retrieved_evidence": retrieved_evidence,
        "retrieved_project_count": context.get("retrieved_project_count", len(context["project_cases"])),
        "retrieved_resume_count": context.get("retrieved_resume_count", context["candidate_count"]),
        "dynamic_workers": workers,
        "human_decision_points": human_points,
        "model_used": not fallback_used,
        "fallback_used": fallback_used,
    }


def _solution_to_document_content(payload: AgentSolutionProjectCreate) -> str:
    solution = payload.solution or {}
    title = solution.get("title") or f"{payload.business_type or payload.industry or '客户'}业务优化方案"
    summary = solution.get("summary") or "基于智能体分析生成的客户业务优化方案。"
    recommended = solution.get("recommended_solutions") or []
    pain_points = _string_list(payload.pain_points)
    goals = _string_list(payload.goals)
    capabilities = _string_list(solution.get("needed_capabilities"))
    risks = _string_list(solution.get("risks"))
    questions = _string_list(solution.get("next_questions"))
    context = solution.get("knowledge_context") or {}

    lines = [
        f"# {title}",
        "",
        "## 客户输入",
        f"- 行业方向：{payload.industry or '待补充'}",
        f"- 业务类型：{payload.business_type or '待补充'}",
        f"- 当前流程：{payload.current_process or '待补充'}",
        f"- 主要痛点：{'、'.join(pain_points) or '待补充'}",
        f"- 目标方向：{'、'.join(goals) or '待补充'}",
        "",
        "## 智能体结论",
        summary,
        "",
        "## 推荐方案",
    ]

    if recommended:
        for index, item in enumerate(recommended, start=1):
            if not isinstance(item, dict):
                continue
            lines.extend(
                [
                    f"### {index}. {item.get('name') or f'方案 {index}'}",
                    f"- 应用场景：{item.get('scenario') or '待补充'}",
                    f"- 业务价值：{item.get('value') or '待补充'}",
                ]
            )
            steps = _string_list(item.get("implementation_steps"))
            if steps:
                lines.append("- 实施步骤：")
                lines.extend(
                    [
                        f"  {step_index}. {_clean_numbered_text(step)}"
                        for step_index, step in enumerate(steps, start=1)
                    ]
                )
    else:
        lines.append("待补充推荐方案。")

    lines.extend(
        [
            "",
            "## 交付能力参考",
            "、".join(capabilities) or "待补充",
            "",
            "## 风险与前提",
        ]
    )
    lines.extend([f"- {risk}" for risk in risks] or ["- 待补充"])
    lines.extend(["", "## 客户追问"])
    lines.extend([f"- {question}" for question in questions] or ["- 待补充"])
    lines.extend(
        [
            "",
            "## 知识库背书",
            f"- 引用项目数：{context.get('project_count', 0)}",
            f"- 能力样本数：{context.get('candidate_count', 0)}",
        ]
    )
    return "\n".join(lines)


def list_customer_projects(db: Session) -> List[CustomerProject]:
    return (
        db.query(CustomerProject)
        .options(joinedload(CustomerProject.solution_document))
        .order_by(CustomerProject.created_at.desc())
        .all()
    )


def get_customer_project(db: Session, project_id: UUID) -> CustomerProject | None:
    return (
        db.query(CustomerProject)
        .options(joinedload(CustomerProject.solution_document))
        .filter(CustomerProject.id == project_id)
        .first()
    )


def create_customer_project(
    db: Session,
    payload: CustomerProjectCreate,
    created_by: UUID | None,
) -> CustomerProject:
    project = CustomerProject(**payload.model_dump(), created_by=created_by)
    db.add(project)
    db.flush()

    document = SolutionDocument(
        project_id=project.id,
        title=f"{project.name}业务优化方案",
        content=build_solution_content(project),
        sections={"source": "initial_project_profile"},
    )
    db.add(document)
    db.commit()
    return get_customer_project(db, project.id)


def create_customer_project_from_agent_solution(
    db: Session,
    payload: AgentSolutionProjectCreate,
    created_by: UUID | None,
) -> CustomerProject:
    solution = payload.solution or {}
    title = solution.get("title") or f"{payload.business_type or payload.industry or '客户'}业务优化方案"
    summary = solution.get("summary") or ""
    pain_points = _string_list(payload.pain_points)
    goals = _string_list(payload.goals)
    next_questions = _string_list(solution.get("next_questions"))
    recommended = solution.get("recommended_solutions") or []

    project = CustomerProject(
        name=title,
        industry=payload.industry,
        business_model="\n".join(
            part for part in [
                f"业务类型：{payload.business_type}" if payload.business_type else "",
                f"当前流程：{payload.current_process}" if payload.current_process else "",
                f"智能体摘要：{summary}" if summary else "",
            ] if part
        ),
        pain_points=pain_points,
        goals=goals,
        status=CustomerProjectStatus.DESIGNING,
        diagnosis={
            "problem_categories": ["agent_solution", "delivery_design"],
            "root_cause_hypotheses": [
                f"{point} 需要通过流程、数据和AI员工交付能力共同验证"
                for point in pain_points
            ],
            "optimization_opportunities": [
                item.get("name")
                for item in recommended
                if isinstance(item, dict) and item.get("name")
            ] or goals,
            "next_questions": next_questions,
        },
        created_by=created_by,
    )
    db.add(project)
    db.flush()

    document = SolutionDocument(
        project_id=project.id,
        title=title,
        content=_solution_to_document_content(payload),
        sections={"source": "industry_agent_solution", "solution": solution},
    )
    db.add(document)
    db.commit()

    generate_project_tasks(db, project.id)
    return get_customer_project(db, project.id)


def update_customer_project(
    db: Session,
    project_id: UUID,
    payload: CustomerProjectUpdate,
) -> CustomerProject | None:
    project = get_customer_project(db, project_id)
    if not project:
        return None

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, key, value)

    if project.solution_document:
        project.solution_document.content = build_solution_content(project)

    db.commit()
    return get_customer_project(db, project.id)


def generate_diagnosis(db: Session, project_id: UUID) -> CustomerProject | None:
    project = get_customer_project(db, project_id)
    if not project:
        return None

    project.diagnosis = {
        "problem_categories": ["efficiency", "growth"] if project.goals else ["discovery"],
        "root_cause_hypotheses": [
            f"{point} 可能来自流程、工具或组织协同缺口"
            for point in (project.pain_points or [])
        ],
        "optimization_opportunities": [
            f"围绕 {goal} 建立可执行项目"
            for goal in (project.goals or [])
        ],
        "next_questions": ["当前流程由哪些角色负责？", "现有数据指标是否可获得？"],
    }
    db.commit()
    return get_customer_project(db, project.id)


def _project_solution(project: CustomerProject) -> Dict[str, Any]:
    document = project.solution_document
    sections = document.sections if document and isinstance(document.sections, dict) else {}
    solution = sections.get("solution")
    return solution if isinstance(solution, dict) else {}


def _infer_employee_type(worker_name: str, responsibility: str) -> str:
    text = f"{worker_name} {responsibility}"
    if any(term in text for term in ["样本", "案例", "行业", "对标"]):
        return "industry_researcher"
    if any(term in text for term in ["指标", "校验", "复盘", "数据"]):
        return "data_analyst"
    if any(term in text for term in ["实施", "生成", "导出", "映射", "开发", "文档"]):
        return "implementation_planner"
    if any(term in text for term in ["资料", "客户", "需求", "抽取"]):
        return "business_analyst"
    return "product_manager"


def _dynamic_worker_task_templates(project: CustomerProject) -> List[tuple[str, str, str, str, str]]:
    solution = _project_solution(project)
    dynamic_workers = solution.get("dynamic_workers") or []
    if not isinstance(dynamic_workers, list):
        return []

    templates: List[tuple[str, str, str, str, str]] = []
    for index, worker in enumerate(dynamic_workers, start=1):
        if not isinstance(worker, dict):
            continue
        name = str(worker.get("name") or f"AI 执行员工 {index}").strip()
        responsibility = str(worker.get("responsibility") or "根据方案承担具体执行任务").strip()
        human_review = str(worker.get("human_review") or "关键结论由人工审核确认").strip()
        templates.append(
            (
                f"dynamic_worker_{index}",
                name,
                responsibility,
                f"{name}交付物：{responsibility}；人工审核：{human_review}",
                _infer_employee_type(name, responsibility),
            )
        )
    return templates


def generate_project_tasks(db: Session, project_id: UUID) -> List[ProjectTask]:
    project = get_customer_project(db, project_id)
    if not project:
        return []

    existing_tasks = (
        db.query(ProjectTask)
        .filter(ProjectTask.project_id == project.id)
        .order_by(ProjectTask.created_at.asc())
        .all()
    )
    if existing_tasks:
        return existing_tasks

    templates = _dynamic_worker_task_templates(project) or [
        ("source_collection", "整理客户资料", "汇总客户现状、流程、痛点和目标", "形成客户背景摘要", "business_analyst"),
        ("diagnosis", "业务问题诊断", "分析根因假设和待确认问题", "形成诊断结论", "business_analyst"),
        ("capability_matching", "匹配能力样本", "从高级人才样本中寻找可参考经验", "形成能力背书", "industry_researcher"),
        ("solution_design", "设计优化方案", "把诊断转成方案模块和路线图", "形成方案大纲", "product_manager"),
        ("metrics", "设计验证指标", "定义收益、风险和验证指标", "形成指标体系", "data_analyst"),
        ("roadmap", "拆解实施路径", "拆解里程碑、任务和风险", "形成执行路线图", "implementation_planner"),
    ]
    tasks = [
        ProjectTask(
            project_id=project.id,
            stage=stage,
            title=title,
            description=description,
            expected_output=expected_output,
            ai_employee_type=employee_type,
        )
        for stage, title, description, expected_output, employee_type in templates
    ]
    db.add_all(tasks)
    db.commit()

    return (
        db.query(ProjectTask)
        .filter(ProjectTask.project_id == project.id)
        .order_by(ProjectTask.created_at.asc())
        .all()
    )


def _solution_direction_names(solution: Dict[str, Any]) -> List[str]:
    directions = []
    for item in solution.get("recommended_solutions") or []:
        if isinstance(item, dict) and item.get("name"):
            directions.append(str(item["name"]))
    return directions


def _extract_human_review(task: ProjectTask) -> str:
    expected = task.expected_output or ""
    marker = "人工审核："
    if marker in expected:
        return expected.split(marker, 1)[1].strip(" 。；;")
    return "人工确认客户承诺、事实依据和最终交付口径"


def _project_brief(project: CustomerProject) -> str:
    pain_points = "、".join(project.pain_points or []) or "客户痛点待补充"
    goals = "、".join(project.goals or []) or "业务目标待补充"
    return f"客户痛点：{pain_points}；目标：{goals}"


def _task_delivery_items(task: ProjectTask, solution: Dict[str, Any]) -> tuple[List[str], str]:
    text = f"{task.stage} {task.title} {task.description} {task.expected_output}"
    direction_names = _solution_direction_names(solution)
    direction_text = "、".join(direction_names[:3]) or "当前方案模块"

    if any(term in text for term in ["模板", "字段", "映射"]):
        return (
            [
                "模板字段清单初稿：字段名称 / 填写口径 / 来源资料 / 人工确认点",
                f"字段映射建议：把客户资料库字段映射到「{direction_text}」的模板字段",
                "缺口标记：无法自动确认的官方解释、必填附件、资质有效期和项目口径",
            ],
            "模板字段清单初稿",
        )
    if any(term in text for term in ["资料", "抽取", "客户资料"]):
        return (
            [
                "客户资料目录：公司资质、人员证书、项目基础信息、历史方案材料",
                "可自动抽取字段：项目名称、地址、负责人、治理范围、预算、资质编号",
                "资料缺口清单：缺少原件、过期资质、无法确认适用范围的字段",
            ],
            "客户资料目录与缺口清单",
        )
    if any(term in text for term in ["样本", "案例", "背书", "行业"]):
        return (
            [
                f"能力背书方向：{direction_text}",
                "引用方式：只使用匿名能力样本和项目方法，不对外冒充真实客户案例",
                "可复用方法：模板库、字段字典、资料库治理、人工审核闭环",
            ],
            "能力样本匹配摘要",
        )
    if any(term in text for term in ["方案", "产品", "设计"]):
        return (
            [
                f"MVP模块：{direction_text}",
                "核心流程：模板入库、资料抽取、字段映射、初稿生成、人工审核、导出交付",
                "边界说明：AI负责资料整理和初稿，人负责口径判断、客户承诺和最终验收",
            ],
            "MVP方案模块与范围说明",
        )
    if any(term in text for term in ["指标", "校验", "验证"]):
        return (
            [
                "效率指标：单份方案制作耗时、重复填报减少比例、缺失字段补齐率",
                "质量指标：字段准确率、模板格式通过率、人工退回次数",
                "风险指标：过期资质引用、敏感信息外发、官方模板版本不一致",
            ],
            "指标体系与验收口径",
        )
    if any(term in text for term in ["路线", "实施", "拆解", "生成", "导出", "文档"]):
        return (
            [
                "第1周：收集模板和客户资料，建立字段字典",
                "第2周：完成资料抽取、字段映射和缺口标记",
                "第3周：生成方案初稿、人工审核、导出交付样稿",
            ],
            "实施路线图与人工验收节点",
        )
    return (
        [
            "客户问题拆解：把痛点、目标、资料现状和交付物拆成可执行清单",
            f"方案承接：围绕 {direction_text} 组织下一步工作",
            "人工确认：确认客户真实业务边界、预算和交付承诺",
        ],
        task.expected_output or task.title,
    )


def _build_ai_employee_output(task: ProjectTask) -> Dict[str, Any]:
    project = task.project
    solution = _project_solution(project)
    delivery_items, document_update = _task_delivery_items(task, solution)
    diagnosis = project.diagnosis or {}
    follow_up_questions = _string_list(solution.get("next_questions")) or diagnosis.get("next_questions") or [
        "客户是否能提供官方模板示例？",
        "客户现有资质、人员、项目信息的存储格式和完整度如何？",
    ]
    human_review = _extract_human_review(task)
    deliverable_title = f"{task.title}交付草稿"

    draft_lines = [
        f"{deliverable_title}",
        "",
        "任务目标",
        f"- {task.description or task.expected_output or task.title}",
        f"- {_project_brief(project)}",
        "",
        "已完成的执行内容",
        *[f"- {item}" for item in delivery_items],
        "",
        "写入方案的内容",
        f"- {document_update}",
        "",
        "人工确认点",
        f"- {human_review}",
        "- 人工确认本次输出是否可以进入客户承诺和最终交付文档",
    ]

    return {
        "deliverable_title": deliverable_title,
        "draft": "\n".join(draft_lines),
        "completed_items": delivery_items,
        "human_review_points": [
            human_review,
            "人工确认本次输出是否可以进入客户承诺和最终交付文档",
        ],
        "follow_up_questions": follow_up_questions,
        "suggested_document_updates": [document_update],
    }


def update_project_task(db: Session, task_id: UUID, payload: ProjectTaskUpdate) -> ProjectTask | None:
    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        return None

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, key, value)

    db.commit()
    db.refresh(task)
    return task


def get_solution_document(db: Session, project_id: UUID) -> SolutionDocument | None:
    return db.query(SolutionDocument).filter(SolutionDocument.project_id == project_id).first()


def update_solution_document(db: Session, project_id: UUID, content: str) -> SolutionDocument | None:
    document = get_solution_document(db, project_id)
    if not document:
        return None

    document.content = content
    db.commit()
    db.refresh(document)
    return document


def list_ai_employees(db: Session | None = None) -> List[Dict[str, Any]]:
    if db is None:
        return [{**employee} for employee in AI_EMPLOYEES]

    active_statuses = [
        ProjectTaskStatus.TODO,
        ProjectTaskStatus.IN_PROGRESS,
        ProjectTaskStatus.REVIEW,
    ]
    employees: List[Dict[str, Any]] = []
    for employee in AI_EMPLOYEES:
        employee_type = employee["employee_type"]
        next_task = (
            db.query(ProjectTask)
            .options(joinedload(ProjectTask.project))
            .filter(
                ProjectTask.ai_employee_type == employee_type,
                ProjectTask.status.in_(active_statuses),
            )
            .order_by(ProjectTask.created_at.asc())
            .first()
        )
        ready_task_count = (
            db.query(func.count(ProjectTask.id))
            .filter(
                ProjectTask.ai_employee_type == employee_type,
                ProjectTask.status.in_(active_statuses),
            )
            .scalar()
            or 0
        )
        accepted_run_count = (
            db.query(func.count(AIEmployeeRun.id))
            .join(ProjectTask, AIEmployeeRun.task_id == ProjectTask.id)
            .filter(
                ProjectTask.ai_employee_type == employee_type,
                AIEmployeeRun.status == AIEmployeeRunStatus.ACCEPTED,
            )
            .scalar()
            or 0
        )
        employees.append(
            {
                **employee,
                "ready_task_count": ready_task_count,
                "accepted_run_count": accepted_run_count,
                "next_task_id": next_task.id if next_task else None,
                "next_project_id": next_task.project_id if next_task else None,
                "latest_project_name": next_task.project.name if next_task and next_task.project else None,
            }
        )
    return employees


def list_capability_samples(db: Session) -> List[Dict[str, Any]]:
    resumes = (
        db.query(Resume)
        .filter(Resume.parse_status == "success")
        .order_by(Resume.created_at.desc())
        .all()
    )
    samples = []
    for resume in resumes:
        parsed = resume.parsed_data or {}
        work = parsed.get("work_experiences") or []
        projects = parsed.get("project_experiences") or []
        functions = [
            item.get("role")
            for item in work
            if isinstance(item, dict) and item.get("role")
        ]
        samples.append(
            {
                "resume_id": resume.id,
                "sample_name": f"{resume.candidate_name or '匿名样本'}能力样本",
                "industry_key": parsed.get("industry_key"),
                "industry_label": parsed.get("industry_label"),
                "functions": functions,
                "capabilities": functions,
                "project_patterns": [
                    item.get("name")
                    for item in projects
                    if isinstance(item, dict) and item.get("name")
                ],
                "methodology_tags": [parsed.get("logic_analysis")] if parsed.get("logic_analysis") else [],
            }
        )
    return samples


def _asset_item(title: str | None, description: str | None = None, route: str | None = None) -> Dict[str, str]:
    return {
        "title": title or "未命名样本",
        "description": description or "",
        "route": route or "",
    }


def list_knowledge_assets(db: Session) -> List[Dict[str, Any]]:
    parsed_resume_count = (
        db.query(func.count(Resume.id))
        .filter(Resume.parse_status == "success", Resume.parsed_data.isnot(None))
        .scalar()
        or 0
    )
    project_count = db.query(func.count(CustomerProject.id)).scalar() or 0
    solution_count = db.query(func.count(SolutionDocument.id)).scalar() or 0
    sop_count = db.query(func.count(ProjectTask.id)).scalar() or 0
    template_count = (
        db.query(func.count(SolutionDocument.id))
        .filter(SolutionDocument.content.contains("模板"))
        .scalar()
        or 0
    )

    latest_resumes = (
        db.query(Resume)
        .filter(Resume.parse_status == "success", Resume.parsed_data.isnot(None))
        .order_by(Resume.created_at.desc(), Resume.id.desc())
        .limit(3)
        .all()
    )
    latest_projects = (
        db.query(CustomerProject)
        .order_by(CustomerProject.created_at.desc(), CustomerProject.id.desc())
        .limit(3)
        .all()
    )
    latest_documents = (
        db.query(SolutionDocument)
        .order_by(SolutionDocument.created_at.desc(), SolutionDocument.id.desc())
        .limit(3)
        .all()
    )
    latest_tasks = (
        db.query(ProjectTask)
        .order_by(ProjectTask.created_at.desc(), ProjectTask.id.desc())
        .limit(3)
        .all()
    )
    template_documents = (
        db.query(SolutionDocument)
        .filter(SolutionDocument.content.contains("模板"))
        .order_by(SolutionDocument.created_at.desc(), SolutionDocument.id.desc())
        .limit(3)
        .all()
    )

    return [
        {
            "asset_type": "talent_capabilities",
            "title": "高级人才能力样本库",
            "description": "从外部候选人、高级白领简历中抽取行业经历、项目打法和能力标签。",
            "value": "证明有人做过类似事情，为客户方案提供能力背书。",
            "source": "简历解析与能力样本抽取",
            "count": parsed_resume_count,
            "route": "/resumes",
            "maturity": "available",
            "sample_items": [
                _asset_item(resume.candidate_name, resume.parsed_data.get("industry_label") if isinstance(resume.parsed_data, dict) else None, f"/resumes/{resume.id}")
                for resume in latest_resumes
            ],
        },
        {
            "asset_type": "project_cases",
            "title": "项目案例样本库",
            "description": "沉淀客户背景、原始问题、解决方案、执行过程和结果指标。",
            "value": "让 AI 从“业务问题如何被解决”出发生成更像顾问的方案。",
            "source": "客户项目案卷",
            "count": project_count,
            "route": "/customer-projects",
            "maturity": "available",
            "sample_items": [
                _asset_item(project.name, "、".join(project.pain_points or []), f"/customer-projects/{project.id}")
                for project in latest_projects
            ],
        },
        {
            "asset_type": "template_materials",
            "title": "行业模板资料库",
            "description": "官方模板、表单、申报材料、投标文件、合同和验收表等可填报资料。",
            "value": "支撑自动填报、自动生成文档和合规检查这类可直接落地的 AI 员工任务。",
            "source": "方案文档与模板型项目",
            "count": template_count,
            "route": "/customer-projects",
            "maturity": "mvp",
            "sample_items": [
                _asset_item(document.title, "包含模板/填报相关内容", f"/customer-projects/{document.project_id}")
                for document in template_documents
            ],
        },
        {
            "asset_type": "solution_library",
            "title": "解决方案样本库",
            "description": "沉淀已生成的客户方案、PRD要点、系统模块、交付计划和风险前提。",
            "value": "形成你自己的咨询资产，后续新客户方案可以复用、改写、组合。",
            "source": "客户方案文档",
            "count": solution_count,
            "route": "/customer-projects",
            "maturity": "available",
            "sample_items": [
                _asset_item(document.title, "已生成方案文档", f"/customer-projects/{document.project_id}")
                for document in latest_documents
            ],
        },
        {
            "asset_type": "execution_sops",
            "title": "执行SOP样本库",
            "description": "沉淀 AI 员工执行任务、人工审核点、交付草稿和验收结果。",
            "value": "让后续 AI 员工不是空聊，而是按可复用步骤执行任务。",
            "source": "客户任务板与 AI 员工输出",
            "count": sop_count,
            "route": "/ai-employees",
            "maturity": "mvp",
            "sample_items": [
                _asset_item(task.title, task.expected_output, f"/customer-projects/{task.project_id}")
                for task in latest_tasks
            ],
        },
    ]


def create_ai_employee_run(db: Session, task_id: UUID) -> AIEmployeeRun | None:
    task = (
        db.query(ProjectTask)
        .options(joinedload(ProjectTask.project))
        .filter(ProjectTask.id == task_id)
        .first()
    )
    if not task:
        return None

    employee_name = next(
        (item["display_name"] for item in AI_EMPLOYEES if item["employee_type"] == task.ai_employee_type),
        "AI 员工",
    )
    output = _build_ai_employee_output(task)
    output["assumptions"] = [
        f"{employee_name}输出为方案执行草稿，需要顾问审核后进入正式方案",
        f"任务阶段为 {task.stage}，需与客户访谈和样本证据交叉验证",
    ]
    run = AIEmployeeRun(
        task_id=task.id,
        employee_type=task.ai_employee_type or "business_analyst",
        prompt_context={"project_name": task.project.name, "task_title": task.title},
        output=output,
    )
    task.status = ProjectTaskStatus.IN_PROGRESS
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def accept_ai_employee_run(db: Session, run_id: UUID) -> AIEmployeeRun | None:
    run = (
        db.query(AIEmployeeRun)
        .options(joinedload(AIEmployeeRun.task).joinedload(ProjectTask.project))
        .filter(AIEmployeeRun.id == run_id)
        .first()
    )
    if not run:
        return None

    run.status = AIEmployeeRunStatus.ACCEPTED
    run.reviewer_decision = "accepted"
    run.task.status = ProjectTaskStatus.DONE
    run.task.output = run.output

    document = get_solution_document(db, run.task.project_id)
    if document:
        document.content = (
            f"{document.content}\n\n"
            f"## {run.task.title} 验收输出\n"
            f"{run.output.get('draft', '')}"
        )

    db.commit()
    db.refresh(run)
    return run


def discard_ai_employee_run(db: Session, run_id: UUID) -> AIEmployeeRun | None:
    run = db.query(AIEmployeeRun).filter(AIEmployeeRun.id == run_id).first()
    if not run:
        return None

    run.status = AIEmployeeRunStatus.DISCARDED
    run.reviewer_decision = "discarded"
    db.commit()
    db.refresh(run)
    return run
