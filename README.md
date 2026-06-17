# QylinIntel Business Transformation OS

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Backend](https://img.shields.io/badge/backend-FastAPI-009688.svg)
![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-646CFF.svg)
![Database](https://img.shields.io/badge/database-PostgreSQL-336791.svg)
![AI](https://img.shields.io/badge/AI-OpenAI%20SDK%20compatible-7C3AED.svg)

QylinIntel 是一个面向业务咨询、方案交付和资料治理的 AI 工作台。当前主线已经从早期的招聘流程管理，演进为「资料入库 -> 知识资产 -> 方案 Agent -> 客户案卷 -> 交付任务」的一体化系统。

系统适合用来沉淀行业资料、客户材料、项目案例、邮箱样本和能力样本，再让方案 Agent 基于可追溯证据生成方案草案、拆解 AI 执行员工和人工决策点。

![方案 Agent 工作台](docs/assets/screenshots/ai-employees.png)

## 当前定位

这不是一个只调用大模型生成文本的页面。系统会先把资料变成可检索、可复核、可引用的知识资产，再在方案生成时展示检索证据、覆盖程度、运行链路和未被证据支持的结论。

核心流程：

1. 资料入库：上传 PDF、DOCX、TXT、Markdown，或直接粘贴正文。
2. 知识资产：抽取文本、切片、打标签、生成摘要、记录来源和证据边界。
3. 方案 Agent：结合客户需求检索知识资产，生成带证据引用的解决方案。
4. 客户案卷：把方案沉淀为客户项目、方案文档和任务清单。
5. 人工复核：关键事实、客户承诺和最终交付内容保留人工确认。

## 核心能力

| 模块 | 能力 |
| --- | --- |
| 方案 Agent | 对话式需求理解、SSE 运行轨迹、证据检索、覆盖度评估、方案生成、AI 执行员工拆解 |
| 资料入库 | 支持文件上传和正文粘贴，自动抽取文本、分片、记录来源和保密级别 |
| 知识资产库 | 按来源、行业、主题、证据类型、复核状态和评分管理可引用资料 |
| RAG 检索链路 | 关键词、BM25-like、语义哈希向量、RRF 融合、rerank、上下文压缩和引用 ID |
| 客户案卷 | 从 Agent 方案生成客户项目，沉淀诊断、方案文档、任务板和导出内容 |
| 邮箱样本 | 同步 BOSS 邮件附件，解析简历/能力样本，并同步为可引用知识资产 |
| 系统设置 | 用户管理、模型配置、OpenAI 兼容接口、Prompt 配置、邮箱导入配置 |

## 产品截图

### 方案 Agent

方案 Agent 是当前主入口，页面主图见上方。用户输入客户需求、公司资料、项目材料和约束条件后，系统会检索知识资产库，输出证据、方案、风险、追问、下一步动作和动态 AI 执行员工。

### 客户案卷

客户案卷用于承接方案交付。每个案卷会沉淀客户背景、核心问题、交付目标、方案文档和任务状态，让方案从一次对话继续推进到可管理的交付过程。

![客户项目案卷](docs/assets/screenshots/customer-projects.png)

## 典型使用方式

### 1. 建立资料库

进入「资料入库」，上传外部报告、官方模板、客户资料、历史项目材料，或直接粘贴正文。系统会把长文档切成多个知识片段，并保留来源文件、片段序号、摘要、标签和证据说明。

### 2. 复核知识资产

进入「知识资产库」，按行业、主题、证据类型、来源和复核状态筛选资料。团队可以检查每条资产能证明什么、不能证明什么，以及它适合被哪些方案场景引用。

### 3. 生成方案草案

进入「方案 Agent」，输入客户需求和约束。系统会先检索知识资产，再输出方案。如果证据不足，系统会提示缺口、追问问题和下一步补资料动作，而不是直接强行编造完整方案。

### 4. 进入交付案卷

方案通过人工复核后，可以生成客户案卷。案卷内继续维护诊断、任务板、执行草稿、方案文档和导出内容。

## 技术栈

- 前端：React 19、Vite、TypeScript、Ant Design、React Router、Recharts、React Flow
- 后端：FastAPI、SQLAlchemy、Alembic、Pydantic、JWT、Background Tasks、SSE
- 数据库：PostgreSQL 15，测试和轻量开发可使用 SQLite
- AI：OpenAI SDK 兼容接口，支持 DashScope、OpenAI 或企业内部模型网关
- 文档处理：PyMuPDF、PyPDF2、python-docx、Mammoth、pydub
- 部署：Docker Compose、Nginx、GitHub Actions

## 快速开始

### 环境要求

- Node.js 20+
- Python 3.11+
- Docker Desktop 或本地 PostgreSQL 15+
- FFmpeg，音频转写相关功能会用到

### 1. 准备环境变量

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

开发环境默认管理员账号：

```text
admin@example.com / admin123
```

生产环境必须修改 `.env` 中的 `SECRET_KEY`、`INITIAL_ADMIN_PASSWORD` 和数据库密码。

### 2. 启动数据库

```bash
docker compose up -d postgres
```

默认数据库连接：

```text
postgresql://postgres:postgres@localhost:5433/ai_interview
```

### 3. 启动后端

```bash
cd backend
python -m venv venv
```

Windows PowerShell：

```powershell
.\venv\Scripts\Activate.ps1
```

macOS / Linux：

```bash
source venv/bin/activate
```

继续安装依赖并启动服务：

```bash
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API 文档地址：<http://localhost:8000/docs>

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

打开 <http://localhost:5173>。

## 常用命令

```bash
make db              # 启动 PostgreSQL
make dev-backend     # 启动 FastAPI
make dev-frontend    # 启动 Vite
make test-backend    # 运行后端测试
make build-frontend  # 构建前端
make docker-prod     # 构建并启动生产 Compose
```

## Docker 部署

先在根目录 `.env` 设置生产变量，至少包括：

```text
SECRET_KEY=change-this-to-a-long-random-value
INITIAL_ADMIN_PASSWORD=change-this-password
POSTGRES_PASSWORD=change-this-db-password
```

启动生产编排：

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

默认访问地址为 <http://localhost>。前端 Nginx 会代理 `/api` 和 `/uploads` 到后端服务。

## 关键配置

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | 后端数据库连接 |
| `SECRET_KEY` | JWT 签名密钥，生产环境必须修改 |
| `INITIAL_ADMIN_EMAIL` | 首次启动创建的管理员邮箱 |
| `INITIAL_ADMIN_PASSWORD` | 首次启动创建的管理员密码 |
| `INITIAL_ADMIN_NAME` | 首次启动创建的管理员名称 |
| `CORS_ORIGINS` | 允许跨域来源，多个值用逗号分隔 |
| `OPENAI_API_KEY` | OpenAI SDK 兼容模型服务密钥 |
| `OPENAI_BASE_URL` | 模型服务 Base URL |
| `LLM_PROVIDER` | 模型提供方标识，默认 `dashscope` |
| `LLM_MODEL` | 默认模型名称 |
| `RESUME_PARSE_MAX_CONCURRENT` | 样本解析并发数 |
| `VITE_API_URL` | 前端 API 地址，开发默认 `/api` |

## 项目结构

```text
.
├── backend/                 # FastAPI API、模型、服务、路由和 Alembic 迁移
├── frontend/                # React + Vite 前端应用
├── docs/                    # 产品说明、设计记录、截图和架构图
├── scripts/                 # 演示数据、截图和辅助脚本
├── docker-compose.yml       # 开发数据库
├── docker-compose.prod.yml  # 生产编排
└── Makefile                 # 常用开发命令
```

## 测试与质量

后端测试：

```bash
cd backend
pytest
```

前端构建：

```bash
cd frontend
npm run build
```

当前项目也包含 Alembic 迁移检查、知识资产服务测试和前端构建验证，适合在提交前作为基础检查。

## 安全建议

- 不要提交 `.env`、本地数据库、上传文件、简历、音频、客户资料或本地虚拟环境。
- 生产环境务必修改管理员初始密码、数据库密码和 `SECRET_KEY`。
- AI 处理客户资料、简历和项目材料时，要遵守数据授权、隐私保护和本地合规要求。
- 公开部署前建议接入 HTTPS、对象存储、日志审计和更细粒度的数据权限。

## 当前路线

- 强化知识资产复核和引用质量控制。
- 继续完善客户案卷里的多轮 Agent 执行。
- 增加 URL 资料抓取和更细粒度的文档章节切片。
- 改进检索可观测性，让 RAG 命中、融合、rerank 和压缩过程更容易复盘。
- 将早期招聘模块继续收敛为「邮箱样本 / 能力样本 / 证据资产」能力。

## License

MIT
