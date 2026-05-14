from typing import Any, Dict, List, Optional


RESUME_INDUSTRY_PROFILES: List[Dict[str, Any]] = [
    {
        "key": "computer_ai",
        "label": "计算机/AI",
        "color": "blue",
        "strong_keywords": ["AI Agent", "大模型", "人工智能", "知识库", "数据中台", "SaaS", "低代码", "算法平台", "软件平台"],
        "keywords": ["AI", "系统", "平台", "软件", "开发", "数据", "算法", "模型", "智能", "自动化", "质检", "中台"],
    },
    {
        "key": "finance",
        "label": "金融行业",
        "color": "gold",
        "strong_keywords": ["金融服务", "银行", "信贷", "风控", "贷款审批", "授信", "保险", "支付"],
        "keywords": ["金融", "贷款", "合规", "渠道", "转化", "风控", "授信", "理财", "证券", "基金"],
    },
    {
        "key": "engineering",
        "label": "工程建设",
        "color": "volcano",
        "strong_keywords": ["工程造价", "工程结算", "工程审计", "施工管理", "竣工结算", "项目成本"],
        "keywords": ["工程", "造价", "结算", "施工", "地产", "物业", "维保", "巡检", "成本", "审计"],
    },
    {
        "key": "tourism_culture",
        "label": "旅游文娱",
        "color": "purple",
        "strong_keywords": ["文旅", "旅游", "景区", "酒店", "旅行社", "票务", "游客"],
        "keywords": ["旅行", "门票", "住宿", "套餐", "线路", "演出", "内容", "影视", "文娱", "会员"],
    },
    {
        "key": "education",
        "label": "教育培训",
        "color": "cyan",
        "strong_keywords": ["院校数字化", "教学评估", "就业服务", "岗位推荐", "课程体系"],
        "keywords": ["教育", "院校", "学生", "教学", "课程", "培训", "学校", "考试", "学习"],
    },
    {
        "key": "retail_ecommerce",
        "label": "零售电商",
        "color": "green",
        "strong_keywords": ["本地生活", "私域增长", "会员运营", "商户运营", "门店营销", "电商平台"],
        "keywords": ["零售", "电商", "商户", "会员", "GMV", "私域", "门店", "营销", "社交", "增长"],
    },
    {
        "key": "service_business",
        "label": "服务业",
        "color": "geekblue",
        "strong_keywords": ["客户服务", "客服中心", "物业服务", "售后服务", "服务流程"],
        "keywords": ["服务", "客服", "售后", "运营", "交付", "工单", "满意度", "客户成功"],
    },
    {
        "key": "enterprise_management",
        "label": "企业管理",
        "color": "lime",
        "strong_keywords": ["人力资源", "企业管理", "人事系统", "绩效管理", "组织管理", "薪酬绩效"],
        "keywords": ["人事", "HR", "绩效", "OA", "审批", "组织", "员工", "招聘", "考勤", "薪酬", "流程"],
    },
]

DEFAULT_RESUME_INDUSTRY: Dict[str, str] = {
    "key": "general",
    "label": "通用业务",
    "color": "default",
}


def _public_profile(profile: Dict[str, Any]) -> Dict[str, str]:
    return {
        "key": str(profile["key"]),
        "label": str(profile["label"]),
        "color": str(profile["color"]),
    }


RESUME_INDUSTRY_BY_KEY = {
    str(profile["key"]): profile
    for profile in [*RESUME_INDUSTRY_PROFILES, DEFAULT_RESUME_INDUSTRY]
}
RESUME_INDUSTRY_BY_LABEL = {
    str(profile["label"]): profile
    for profile in [*RESUME_INDUSTRY_PROFILES, DEFAULT_RESUME_INDUSTRY]
}


def normalize_resume_industry(value: Any) -> Optional[Dict[str, str]]:
    if not value:
        return None

    key = None
    label = None
    if isinstance(value, str):
        key = value.strip()
        label = value.strip()
    elif isinstance(value, dict):
        key = (
            value.get("industry_key")
            or value.get("positioning_industry_key")
            or value.get("key")
        )
        label = (
            value.get("industry_label")
            or value.get("positioning_industry_label")
            or value.get("label")
            or value.get("industry")
        )
    else:
        return None

    profile = None
    if key:
        profile = RESUME_INDUSTRY_BY_KEY.get(str(key).strip())
    if not profile and label:
        profile = RESUME_INDUSTRY_BY_LABEL.get(str(label).strip())

    return _public_profile(profile) if profile else None


def resume_industry_taxonomy_text() -> str:
    rows = [
        f"- {profile['key']}: {profile['label']}（颜色: {profile['color']}）"
        for profile in RESUME_INDUSTRY_PROFILES
    ]
    rows.append(
        f"- {DEFAULT_RESUME_INDUSTRY['key']}: {DEFAULT_RESUME_INDUSTRY['label']}（颜色: {DEFAULT_RESUME_INDUSTRY['color']}）"
    )
    return "\n".join(rows)
