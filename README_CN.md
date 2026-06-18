# DialogLingo

[English](README.md) | 中文版

![DialogLingo 封面](imgs/cover/cover1.png)

DialogLingo 是一个本地优先的桌面应用，用来把 AI agent 的本地聊天历史转成可审核的英语学习册，并导出为 Anki 可用的卡片包或文本包。

现在和 AI 聊天，用英语通常最顺畅，效果也最好。如果你已经在用 Codex、Claude Code、OpenCode 这类 agent 工具开发，那么你的日常对话里其实已经有很多真实语境。DialogLingo 会读取这些本地对话历史，让你筛选会话、生成 `Expression` 和 `Sentence` 两类学习条目，再导出到 Anki 或其他学习工具。

## 项目初衷

很多英语学习 App 提供的是通用例句，和真实工作语境距离较远。DialogLingo 的出发点是：把你已经产生的 AI 对话变成学习材料。

它不是一个长期背单词系统，也不试图替代 Anki。它聚焦在一条更轻的流程：

```text
本地会话 -> 筛选选择 -> 生成学习册 -> 审核编辑 -> 导出
```

你在 DialogLingo 中检查、修改和清理生成结果，然后把最终内容交给 Anki 或其他工具学习。

## 界面截图

### 搜索与选择

![搜索与选择](imgs/search_select.png)

### 学习册审核

![学习册](imgs/workbook.png)

### 可修改的生成 Prompt

![生成 Prompt](imgs/generate_prompt.png)

### 导出配置

![导出配置](imgs/export.png)

## 主要特性

- **本地会话发现**：从默认路径索引 Codex、Claude Code、OpenCode 的本地历史记录。
- **搜索与筛选**：按时间、平台、项目、标题或对话正文筛选，再选择要生成的会话。
- **学习册生成**：从中英混合的 AI 对话中生成 `Expression` 和 `Sentence` 两类学习条目。
- **Prompt 可见可改**：生成前展示最终模型 Prompt，可按本次任务调整。
- **噪声清理**：模型调用前会预清理工具输出、日志、代码块、路径片段和明显的密钥样式字符串。
- **先审核再导出**：支持编辑、删除、恢复、还原，并能查看条目对应的来源上下文。
- **Anki 优先导出**：支持 `.apkg`、Anki 文本包和通用文本包，可配置牌组名、卡片方向、标签前缀和条目类型。
- **模型入口克制**：支持 OpenAI 兼容 API，也支持 Codex、Claude、OpenCode 的本地 CLI 后端。
- **本地优先与隐私**：索引默认在本地完成；远程生成需要用户显式配置模型服务。
- **中英文界面**：内置英文和简体中文界面文本。

## 安装方式

首选方式：到 GitHub Releases 页面下载对应平台安装包：

[https://github.com/wufei-png/dialoglingo/releases](https://github.com/wufei-png/dialoglingo/releases)

只有在想体验最新未发布功能，或需要本地开发时，才建议从源码运行。

环境要求：

- Node.js `24.15.0`
- npm
- 至少有一种受支持 agent 工具的本地聊天历史

```bash
git clone https://github.com/wufei-png/dialoglingo.git
cd dialoglingo
nvm use
npm install
npm run dev
```

如果只是想体验学习册界面，不想调用远程 API 或本地 CLI 模型后端，可以使用 mock LLM：

```bash
npm run dev:mock-llm
```

进入应用后，在 `Settings` 中配置 OpenAI 兼容 API，或选择受支持的 CLI 后端。

## 本地打包

```bash
npm run package:mac
npm run package:win
npm run package:linux
```

请选择和当前系统匹配的命令。打包脚本会先构建 Electron 应用并校验打包输入。

## 开发命令

常用命令：

```bash
npm run dev
npm run dev:mock-llm
npm run typecheck
npm test
npm run build
```

当前产品与架构约定见：

- [DialogLingo v1 Design](docs/superpowers/specs/2026-06-15-dialoglingo-v1-design.md)
- [Generation Pre-clean and Candidate Mining](docs/architecture/2026-06-18-generation-preclean-candidate-mining.md)

## Native Module ABI 说明

本仓库中的 `better-sqlite3` 需要分别服务 Node 测试环境和 Electron 运行环境。

- `npm run build` 和 `npm run dev` 会执行 `prepare:native:electron`，重建 Electron main process 使用的 ABI 版本。
- Vitest 和其他普通 Node 命令需要 Node ABI 版本。
- 如果在 Electron 构建后运行 Node 测试遇到 `NODE_MODULE_VERSION`，先刷新 Node ABI 和快照：

```bash
npm run rebuild:native:node
npm run capture:native:node
npm run test -- --run
```

不要移除 Electron rebuild 步骤。详细策略见 [Electron stack version decision](docs/architecture/2026-06-15-electron-stack-version-decision.md)。

## 项目地址

[https://github.com/wufei-png/dialoglingo](https://github.com/wufei-png/dialoglingo)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=wufei-png/dialoglingo&type=Date)](https://star-history.com/#wufei-png/dialoglingo&Date)

## License

MIT
