1. 操作入口位置：“Generate” 按钮

规格把 Generate workbook 按钮和已选数量放在主预览窗格底部的 sticky bar 中。

注意力分裂问题： 用户在勾选复选框和展开分组时，视觉焦点和鼠标位置几乎都在左侧栏。如果还要把鼠标拖到右侧窗格底部，会打断操作流。
优化建议： 把摘要栏，例如 “14 sessions selected”，放在左侧栏底部，或者做成横跨整个窗口的底部 footer，并把 Generate 按钮直接附着在上面。也可以绑定 Cmd/Ctrl + Enter 触发生成。


2. 徽章与标签（Badges）的动态补偿
当前设计：Only one grouping mode may be active at a time (Platform, Time range, Project)。

体验痛点：如果我 Group by = Time range，左侧列表里就会出现一堆同名或类似标题的 Session，我无法直观区分哪个是 Claude 生成的，哪个是 Codex 生成的。

优化建议：

列表项（Session row）的 UI 设计需要根据当前的 Group by 动态补偿信息。
如果按 Time 分组，每行 Session 必须带有极小的 Platform 和 Project 图标/标签。
如果按 Platform 分组，每行 Session 则需要显示明确的时间戳或相对时间（"2 hours ago"）。


3. 极其危险的“默认全选”策略
当前设计：On launch: default-select all discovered projects, default-select all sessions，且 groups default to collapsed。

体验痛点：对于有重度使用习惯的程序员，本地可能存在几百上千个历史会话。如果默认全选，用户一旦没注意直接点击 Generate，将会向 LiteLLM 发送海量并发请求，瞬间烧掉大量 Token，或者卡死本地处理管线。

优化建议：

取消全局默认全选。改为 默认选中近 7 天的会话，或者干脆 默认全不选。

在左侧树的顶部提供明确的 Select All in View（选中当前筛选条件下的所有）按钮。


4. 搜索结果的跳转交互（Search Navigation）
当前设计：左侧 Session 行和右侧主面板都支持 FTS5 高亮展示（snippets/highlights）。

体验痛点：长会话中，如果命中的关键词在第 50 个 Turn（对话轮次），用户点进去后还需要自己手动滚动去寻找高亮位置。

优化建议：

在右侧预览区被 focus 且命中搜索结果时，自动滚动到第一个高亮匹配项（Scroll to first match）。

如果可以，在预览区提供原生的 [<] [>] (Next/Prev match) 微型导航，复用大家习惯的浏览器 Ctrl+F 体验。


5. 预览面板缺乏“语言学习”视角的降噪
当前设计：右侧显示 raw 或 normalized conversation preview，提供 FTS 高亮。

体验痛点：对于 Codex / Claude Code 的聊天记录，通常包含大段的 JSON、代码块、Log 输出和 Shell 报错。对于一个“语言学习”软件，用户在生成前看预览，主要是想确认“这篇对话里有没有我值得学的英语/外语交流”，大段代码是纯视觉噪音。

优化建议：

在主预览区右上角增加一个 Toggle（开关）：Collapse Code/Logs（折叠代码与日志），默认开启。

或者提供一个 Highlight Natural Language 的高亮模式，让中英文对话部分在视觉上更突出，让用户一秒就能判断这个 Session 有没有生成 Workbook 的价值。



6. 折叠状态下的选择感知（Selection Awareness）
当前设计：组默认折叠，通过点击复选框选中/取消选中。

体验痛点：如果组是折叠的，用户怎么知道这个组里面有多少个被选中了？如果用户想排除掉某个特定的 Session，他们必须一层层点开。

优化建议：

在 Group 的 Header 上不仅要有批量选择的 Checkbox，还要有 部分选中状态（Indeterminate checkbox），并在旁边显示具体的数字，例如：Platform: Claude Code (3/15 selected)。

当该组被部分选中时，Checkbox 应该呈现半选状态（通常是一个 - 减号图标），点击一次全选，再点一次全不选。


7. 左侧栏信息架构：分离“数据过滤”与“视图控制”
当前设计：Filter header 包含了 Time range, Platform, Projects, Group by。

体验痛点：将数据过滤条件（Time, Platform, Project）和视图控制条件（Group by）混在一个紧凑的 Header 中，在认知上不够清晰。

优化建议：

将 Filters（过滤） 和 View Options（视图） 分层。

搜索框（Search Box） 应该放在最顶层，紧跟其后的是漏斗图标或折叠的过滤面板（Time, Platform, Project）。

Group by 应该作为会话列表（Session tree）的工具栏（Toolbar）存在，悬浮在列表上方，而不是算作 Filter 的一部分。

Search & Select 页面 UI 线框图

┌─────────────────────────────────────────────────────────────────────────────┐
│  [ Search & Select ]    [ Workbook (Draft) ]                                │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ 🔍 Search in titles, transcripts...  │ ──────────────────────────────────── │
│ ──────────────────────────────────── │  Project: DialogLingo / App.tsx      │
│ [Y] Filters (3 active)       [Clear] │  Platform: Claude Code               │
│   Time:     [ Last 7 days ▾ ]        │  Time: 2 hours ago                   │
│   Platform: [ All ▾ ]                │ ──────────────────────────────────── │
│   Project:  [ DialogLingo ▾ ]        │                                      │
│                                      │  # 🤖 Add Zustand for local UI state │
│ ════════════════════════════════════ │                                      │
│ [列表视图控制栏 / List Toolbar]      │  User:                               │
│ Group by: [ Platform ▾ ]             │  "We need to manage the active view  │
│ 24 Sessions  |  [✔ 部分选中 (3)]     │  and selected session IDs without    │
│ ──────────────────────────────────── │  polluting TanStack Query."          │
│ ▼ 🤖 Claude Code (3/15 selected)     │                                      │
│   [ ] Fix DB schema (2h ago)         │  Claude:                             │
│   [x] Explain async Rust             │  "Using Zustand is a great fit here. │
│   [x] Translate spec to EN           │  Here is how you can set up the      │
│   [x] Refactor UI components         │  store..."                           │
│                                      │                                      │
│ ▶ ⚡ OpenCode (0/9 selected)         │  [代码块已折叠: 展开查看 42 行代码]    │
│                                      │                                      │
│ ▶ 💻 Codex (0/0 selected)            │                                      │
│                                      │                                      │
│                                      │                                      │
│                                      │                                      │
│ ──────────────────────────────────── │                                      │
│ ⚙ Settings         🔄 Rescan         │  [此会话不包含可提取的外语学习素材]  │
│ [ 🚀 Generate Workbook (3) ]         │  [  (可选操作) 从本次生成中排除  ]     │
└──────────────────────────────────────┴──────────────────────────────────────┘