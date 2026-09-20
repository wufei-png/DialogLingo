# 04 · OpenCode 与来源解析兼容

状态：已实施。优先级：P0。前置条件：03 完成（交付顺序；来源代码不依赖工作簿保存实现）。

## 交付结果

保留旧 OpenCode 文件树读取，同时通过可用 CLI 读取已核实的新布局会话；扫描到不支持的现代布局时给出原因而非静默零结果。Codex/Claude JSONL 中单条损坏或截断的记录不再导致整场会话消失，物理行来源位置保持可追溯。缓存随着各 adapter 的解析语义变化而失效。

## 实施前契约与修改入口

- `src/main/sources/opencode/adapter.ts` 固定读取 `storage/session`、`storage/message`、`storage/part`。`src/main/sources/pathDiscovery.ts` 指向 `~/.local/share/opencode`，设置可覆盖来源路径。`src/main/sources/index.ts` 注册 adapter。
- 本机核查的 OpenCode 1.18.11 数据路径是 `~/.local/share/opencode/opencode.db`，可用 `opencode session list --format json` 与 `opencode export <id>`。较新[官方命令说明](https://opencode.ai/v2/docs/cli/commands/)写为 `opencode session export <id>`。具体 JSON 字段与命令能力必须以当前 CLI 的无敏感样本核验。
- `src/main/sources/codex/adapter.ts`、`claude/adapter.ts` 用 `JSON.parse` 处理 JSONL，坏行可抛错。`src/main/sources/cache.ts` 使用所有来源共用的 `source-scan-cache-v1` 语义版本。`src/main/scan/scanSessions.ts` 消费 adapter 的 session 列表并产生搜索/预览数据。
- `tests/main/sources`、`tests/main/scan`、`tests/main/search` 是回归入口；`src/main/sources/types.ts` 是 adapter、缓存和诊断契约入口。

## 核心决策

针对当前/较新 OpenCode 先探测 CLI 能力，再解析**官方导出**；不依赖内部 `opencode.db` 表结构。使用独立的临时 OpenCode 数据目录或人工合成导出构建 fixture，不能将真实本机会话 export 后“简单脱敏”提交。保留 legacy parser。当用户设置了来源路径覆盖时，CLI 结果必须属于该覆盖路径；无法证明对应关系就保留 legacy 路径并报告诊断，不用全局会话悄悄替代。现代数据库存在但 CLI 缺失或导出形状不支持时，返回 typed diagnostic，同时保留其他来源的扫描结果。

Codex/Claude 用容错 JSONL reader：坏行记受控 warning，保留合法行；`sourceSpanRef` 仍按**原文件物理行号**计，不按过滤后的数组下标。每个 adapter 独立 parserVersion，更新解析规则时只失效相关缓存。保留 session ID、项目归属、归档过滤、scan→search→preview 链路。

## 阶段

1. **CLI characterization 与诊断** — 建立不含真实会话内容的 list/export 样本及字段映射预期；探测两种 export 命令；给缺 CLI、输出不兼容和路径覆盖不匹配定义可读诊断。**依赖：** 无。**验收：** legacy 测试继续通过，已检测但不支持的现代布局不会伪装成成功空扫描；真实本机资料不进入 fixture。运行 `npm test -- tests/main/sources tests/main/scan`、`npm run typecheck`。一个本地提交。
2. **当前格式映射与缓存** — 从 CLI 输出构造 session/turn/source ref 并接入扫描、搜索和预览；缓存按 adapter 版本失效。**依赖：** 阶段 1。**验收：** 合成新格式和 legacy 各有 scan→search→preview 路径，项目/归档/覆盖路径与来源位置可核验。运行 source/scan/search 测试及 `npm run typecheck`。一个本地提交。
3. **JSONL 局部损坏容错** — Codex/Claude 读取单行失败时保留其余合法记录并上报 warning；index/metadata 读取也不能因单条坏行丢整个来源。**依赖：** 阶段 2。**验收：** malformed-line fixture 中前后有效 turn 均存在，来源物理行号不变。运行 `npm test -- tests/main/sources tests/main/scan` 与完整 `npm run ci:verify`。一个本地提交。

## 验证与证据范围

合成 fixture 只证明已捕获的 JSON shape。若本机 CLI 的隔离数据目录不能安全建立，不能用个人会话代替无敏感 characterization；记录当前格式实机验证未完成，并停在该兼容能力的明确阻塞点。只记录聚合计数和错误类别，不提交用户路径、标题或 excerpt。

阶段完成并运行完整检查后，按 `delegated-change-review` 做一次新的只读审查；逐项复核发现，采纳修复后复验并提交。审查结束后在[执行队列](reliability-queue.md)及本文填写提交、检查、审查决定和未验证项。

## 完成记录

- 实施提交：`182a5e5`（现代 OpenCode 布局的 typed diagnostics）、`e883165`（CLI list/export 映射、扫描链路与 adapter 版本缓存）、`e8d65ff`（Codex/Claude JSONL 与元数据局部损坏容错）。审查修复：`b3ff3aa`。
- 验证：阶段 1 的 `npm test -- tests/main/sources tests/main/scan`（16 项）和 `npm run typecheck` 通过；阶段 2 的 source/scan/search 测试（37 项）和 `npm run typecheck` 通过；阶段 3 的 source/scan 测试（22 项）及 `npm run ci:verify`（208 项测试、类型检查、构建）通过。审查修复后再次运行 `npm run ci:verify`，209 项测试、类型检查与构建均通过；每个提交前均检查 staged diff 和 `git diff --cached --check`。
- 独立审查：以 `4916bf7` 为比较基线，3 项发现均采纳并复验：混合 legacy/现代目录优先读取 legacy 会话；非对象 JSONL 值与语法损坏一样被诊断、保留物理行号且不写缓存；现代 CLI 导出失败会跳过该会话的本次持久化，保留先前索引的 turns/search 文本。
- 未验证：本机 OpenCode 1.18.11 的 `session list --format json` 与 `export` 命令已在隔离空数据目录调用，但没有可安全导出的会话，真实 CLI list/export JSON shape 尚未实机验证。没有读取或提交个人会话。也未做 Electron 桌面手工扫描、真实 legacy/现代迁移目录或未来 `opencode session export` 命令的实机验证；合成 fixture 只覆盖已声明的形状。
