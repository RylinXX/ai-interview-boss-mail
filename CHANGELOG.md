# Changelog

## 1.0.1 - 2026-05-12

- 优化 LLM Base URL 配置，自动兼容误填的 chat completions 或 responses 完整端点。
- 新增批量重新解析失败简历的后端能力和测试覆盖。
- 强化 BOSS 邮件简历导入与简历列表/详情页体验。
- 调整简历详情页布局，让原始简历预览和 AI 分析结果并排工作。

## 1.0.0 - 2026-05-01

- 整理为可公开发布的开源项目结构。
- 新增完整 README、贡献指南、安全说明、MIT License 和宣传博客。
- 新增 Docker ignore、环境变量示例、生产 Compose build 配置和 Makefile。
- 强化生产环境密钥校验和初始管理员配置。
- 支持从环境变量初始化 LLM 配置。
- 新增 GitHub Actions 后端测试与前端构建流程。
