# DialogLingo：从 AI 对话里生成英语学习卡片

现在和 AI 聊天，用英语通常最顺畅，效果也最好。如果你也厌倦了机械、枯燥的英语学习 App，并且已经在用 Codex、Claude Code、OpenCode 这类 agent 工具开发，想直接从日常对话里学习英语，不妨试试 DialogLingo。

DialogLingo 可以直接读取本地 AI 对话历史，生成可审核、可编辑、可导入 Anki 的学习卡片。相比从零背通用例句，它更像是把你每天真实发生的技术对话整理成学习材料，也许会更有趣。

## 它解决什么场景

开发者和 AI agent 的对话里经常有真实语境：需求解释、报错排查、代码审查、方案讨论、命令输出后的追问。很多表达并不复杂，但非常贴近日常工作。

DialogLingo 做的事情很克制：它不是新的聊天工具，也不是完整的背单词系统，而是一个本地优先的学习材料生成器。

```text
本地会话 -> 搜索筛选 -> 生成学习册 -> 人工审核 -> 导出到 Anki
```

## 主要特性

### 读取本地 agent 会话

DialogLingo 会从本机发现并索引 Codex、Claude Code、OpenCode 的会话历史。你可以按平台、时间范围、项目和关键词筛选，再选择真正想拿来生成学习材料的会话。

![搜索与选择](../imgs/search_select.png)

### 生成前可查看和修改 Prompt

点击生成后，应用会展示本次生成使用的模型 Prompt。它不是隐藏在后台的黑盒参数，你可以在生成前检查、修改和还原。

![生成 Prompt](../imgs/generate_prompt.png)

### 生成 Expression 和 Sentence 两类条目

DialogLingo 当前聚焦两类学习卡片：

- `Expression`：适合积累常用表达、短语、搭配和工作语境中的自然说法。
- `Sentence`：适合保留完整句子、语气、结构和上下文。

生成过程不是把整段会话直接塞给模型。当前流水线会先做预清理和候选挖掘，尽量过滤工具输出、日志、代码块、路径片段、明显噪声和密钥样式字符串，再把更适合学习的自然语言片段交给模型。

### 先审核，再导出

生成结果会进入学习册页面。你可以编辑、删除、恢复、还原条目，也可以查看每张卡片对应的原始会话来源，确认它不是凭空生成的内容。

![学习册](../imgs/workbook.png)

### Anki 优先导出

DialogLingo 的目标不是让你在应用内长期学习，而是生成干净、可复习的材料，再交给成熟工具。当前支持：

- Anki Package (`.apkg`)
- Anki Text Bundle (`.tsv` + `.md` + `.json`)
- Generic Text Bundle (`.csv` + `.md` + `.json`)

导出时可以配置牌组名、卡片方向、标签前缀、输出名称，以及是否包含 Expression 或 Sentence。

![导出配置](../imgs/export.png)

## 创新点

**1. 从真实工作对话中学习**

学习材料不再来自抽象教材例句，而是来自你每天和 AI agent 交流时真正遇到的上下文。

**2. 本地优先，不强行云同步**

会话索引默认在本地完成。只有当你显式配置 OpenAI 兼容 API 或 CLI 后端时，才会进入模型生成流程。

**3. 不是通用 transcript 浏览器**

DialogLingo 不追求把所有聊天记录做成一个大而全的浏览器。它聚焦“选择会话、生成学习册、审核、导出”这条路径。

**4. 不替代 Anki，而是补齐材料生产环节**

Anki 已经很适合复习。DialogLingo 负责把日常 AI 对话整理成更适合导入 Anki 的学习内容。

## 项目初衷

这个项目的初衷很简单：如果开发者已经每天都在和 AI 用英语交流，那么这些对话本身就值得被重新利用。

传统英语学习工具常常需要你额外切换场景、额外投入素材筛选成本。DialogLingo 希望把这件事做得更自然：从你已经产生的对话里提取学习材料，让学习内容和真实工作语境保持连接。

## 安装方式

首选方式是从 GitHub Releases 页面下载对应平台安装包：

[https://github.com/wufei-png/dialoglingo/releases](https://github.com/wufei-png/dialoglingo/releases)

如果想体验最新未发布功能，或需要本地开发，可以从源码运行。

环境要求：

- Node.js `24.15.0`
- npm
- 本地已有 Codex、Claude Code 或 OpenCode 会话历史

```bash
git clone https://github.com/wufei-png/dialoglingo.git
cd dialoglingo
nvm use
npm install
npm run dev
```

如果只是想先体验界面和学习册流程，可以使用 mock LLM，不需要配置真实模型服务：

```bash
npm run dev:mock-llm
```

如需本地打包：

```bash
npm run package:mac
npm run package:win
npm run package:linux
```

## 项目地址

[https://github.com/wufei-png/dialoglingo](https://github.com/wufei-png/dialoglingo)

## 适合谁

DialogLingo 更适合已经在使用 AI agent 工具、并且希望顺手提升英语表达的人。它不适合想要完整课程体系、学习打卡社区或内置复习算法的用户。

如果你的目标是把日常开发对话变成可复习的英语材料，它会是一个很轻量的起点。
