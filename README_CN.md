# DialogLingo

<p align="center">
  <img src="imgs/cover/cover1.png" alt="DialogLingo 封面" width="100%">
</p>

[English](README.md) | 中文版

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

## 相关项目

调研快照：2026-06-19。目前没有找到和 DialogLingo 完整流程基本一致的开源项目：本地 AI agent 会话发现、搜索筛选、噪声清理、带来源溯源的学习册审核，以及 Anki 优先导出。最接近、重叠最高的是 [voidash/chatGPT-to-Anki](https://github.com/voidash/chatGPT-to-Anki)。

| 项目 | 主要流程 | 和 DialogLingo 的重叠 | 适合选择它的场景 | 适合选择 DialogLingo 的场景 |
| --- | --- | --- | --- | --- |
| [voidash/chatGPT-to-Anki](https://github.com/voidash/chatGPT-to-Anki) | 浏览器扩展加 Anki 插件，把 ChatGPT、Claude.ai、Perplexity.ai 对话和网页划词内容转成 Anki 卡片，不需要 API key。 | 高：AI 对话 -> 可审核卡片 -> 面向 Anki 的导出或导入。 | 主要在网页聊天产品里工作，希望快速把当前对话或网页内容抓进 Anki Desktop。 | 希望按项目、时间和搜索结果批量挖掘本地 Codex、Claude Code、OpenCode 历史，并保留来源溯源和学习册审核。 |
| [nilsreichardt/AnkiGPT](https://github.com/nilsreichardt/AnkiGPT) | 从 PDF 课件或粘贴文本生成卡片，可编辑后以 CSV 导入 Anki。 | 中：AI 生成卡片、带审核步骤，并支持 Anki 导出。 | 源材料主要是课程、幻灯片、PDF 或学习笔记。 | 源材料是本地 agent 聊天历史，目标是从真实 AI 工作对话中提炼表达和句子。 |
| [AlexToumayan/Chat-GPT-Flashcards-To-Anki-Converter](https://github.com/AlexToumayan/Chat-GPT-Flashcards-To-Anki-Converter) | Python 工具，把手动粘贴的 ChatGPT `Front` / `Back` 格式内容转换为 Anki 可导入格式。 | 中低：ChatGPT 输出 -> Anki 导入格式。 | 已经手动让 ChatGPT 生成了卡片，只缺一个轻量格式转换器。 | 需要自动读取会话、抽取候选、去重、编辑和从选定语料导出。 |
| [taabishm2/copy-to-anki](https://github.com/taabishm2/copy-to-anki) | 浏览器扩展，把网页选中文本通过 AnkiConnect 保存到 Anki，并可选用 ChatGPT 生成问题。 | 中：选中文本 -> AI 辅助 Anki 卡片。 | 浏览网页时临时摘录单段材料。 | 需要批量处理已经沉淀下来的多轮 agent 会话。 |
| [pictoune/AnkiLingoFlash](https://github.com/pictoune/AnkiLingoFlash) | 面向语言学习的浏览器扩展，从网页内容生成释义、助记、发音提示等，并集成 AnkiConnect。 | 中：语言学习卡片、AI 辅助和 Anki 集成。 | 想在 Chrome、Edge 或 Firefox 中直接做网页词汇挖掘。 | 想要一个桌面端审核台，把 agent 会话转换为英语学习材料。 |
| [raine/anki-llm](https://github.com/raine/anki-llm) | CLI/TUI 工具，用 OpenAI 兼容 LLM 处理已有 Anki 牌组、按词条生成卡片、支持重试恢复，并通过 AnkiConnect 更新 Anki。 | 中：LLM 辅助 Anki 工作流，包含审核和自动化。 | 已经有 Anki 牌组，需要改进、批处理或扩充。 | 想在内容进入 Anki 之前，先从本地聊天记录生成新的学习册材料。 |
| [thiswillbeyourgithub/AnkiAIUtils](https://github.com/thiswillbeyourgithub/AnkiAIUtils) | 用 AI 为已有 Anki 卡片补解释、助记、插图和复习反馈。 | 低：同样用 AI 增强 Anki 学习，但起点是已有卡片。 | 想在卡片已经进入 Anki 后做 AI 增强。 | 需要上游流水线，把本地 AI 工作对话变成可审核卡片。 |

选择建议：

- 用 DialogLingo 处理本地 agent 历史：`本地会话 -> 筛选选择 -> 生成学习册 -> 审核编辑 -> 导出`。
- 用 `chatGPT-to-Anki` 走最快的网页 AI 对话到 Anki 路径。
- 用 `copy-to-anki` 或 `AnkiLingoFlash` 这类浏览器摘录工具处理单次网页词汇或片段。
- 用 `AnkiGPT` 处理课件、PDF 或学习笔记。
- 用 `anki-llm` 或 `AnkiAIUtils` 处理已经存在的 Anki 牌组，而不是源会话摄取。

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
