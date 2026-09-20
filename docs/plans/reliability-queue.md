# DialogLingo · 可靠性实施队列

状态：实施中（01–03 已完成）。核查基线：`main@24fea69f9fb1e506fb88f3238091ece2388730e4`，2026-09-21。后续会话先核对当前 HEAD、工作树和代码；此基线不是持续有效的现状声明。

## 目标与顺序

现有产品已具备本地扫描 → 搜索/预览 → 生成 → 工作簿 → 导出的完整路径。此队列优先保证发送边界、用户数据、来源兼容和导出结果可信。每份计划对应一次独立实现会话；会话内用 `implement-in-stages` 逐阶段验证和本地提交。后一会话只依赖队列中已完成的前置会话。

| 顺序 | 计划 | 优先级 | 前置 | 状态 |
| --- | --- | --- | --- | --- |
| 01 | [模型发送边界与隐私承诺](01-model-boundary-privacy.md) | P0 | 无 | 已实施 |
| 02 | [数据库完整性与迁移恢复](02-db-integrity-migrations.md) | P0 | 01，交付顺序 | 已实施 |
| 03 | [工作簿可靠保存](03-workbook-durable-save.md) | P0 | 02 | 已实施 |
| 04 | [OpenCode 与来源解析兼容](04-source-compatibility.md) | P0 | 03，交付顺序 | 待实施 |
| 05 | [工作簿键盘焦点](05-workbook-focus.md) | P1 | 03、04，交付顺序 | 待实施 |
| 06 | [导出完整性与 Anki 互操作](06-export-anki.md) | P1 | 02、03、05 | 待实施 |
| 07 | [Electron 与 IPC 边界](07-electron-ipc.md) | P1 | 03、06 | 待实施 |

01 → 02 → 03 → 04 → 05 → 06 → 07 是执行顺序。04 与 05 的代码依赖较少，仍按该顺序交接，避免并行会话互相覆盖。新增业务 migration 只能在 02 完成后进入主线。

## 已定产品契约

- 工作簿 `Source` 保持只读。来源位置和高亮继续指向原始文本；编辑范围是现有译文、释义、解释、测验和标签。不增加传统 Save 主按钮或基于 front/sourceText 的数据库唯一约束。
- APKG 与 manifest 作为同一导出目录中的文件交付，目录整体完成后才对用户呈现。三种导出格式遵守相同的完成判定。
- 隐私开关保留 on/off，但 ON 只承诺明确列出的敏感模式过滤，不能宣称完全匿名。真实 transcript、私有路径、API key、数据库和导出内容不进入 Git。
- OpenCode 优先使用受支持的 CLI 导出接口并按能力探测；保留旧文件布局，不把 `opencode.db` 内部表结构当长期接口。本机核查时 OpenCode 1.18.11 使用 `opencode export`，较新[官方命令文档](https://opencode.ai/v2/docs/cli/commands/)使用 `opencode session export`。
- 模型/来源/Anki/Electron 的兼容行为按实际证据核验。`npm run ci:verify` 证明类型、测试和构建，不等于真实模型发送、Anki 导入、打包启动或跨平台发布。

## 评审意见的取舍

| 处理 | 意见 | 判据 |
| --- | --- | --- |
| 纳入 01–07 | 隐私发送边界、外键及迁移备份、事务/CAS autosave、OpenCode 新布局、真实键盘焦点、原子导出/Anki、Electron/IPC 收口 | 当前代码存在可定位的契约缺口；各计划列出独立验收。 |
| 缩小范围 | transcript corpus、parser/noise/dedupe 指标 | 在相关阶段添加人工合成、针对性回归样本；大规模真实语料评测留到具体质量决策需要它时。 |
| 暂不排期 | Reverse Extraction、Search Preview Code/Log Collapse | 分别等持续漏卡或搜索预览定位失败的证据，见 [`docs/TODO.md`](../TODO.md)。 |
| 发布时另议 | 正式签名、公证及三平台 packaged smoke | 本队列没有公开发布任务；构建成功不证明分发可信。 |

现行 v1 规范将 Source 设为只读，来源面板也用 `currentSnapshot.sourceText` 高亮原始片段。01 实施前提示词预览只给模板；现已区分模板与经当前策略处理的一批示例。已安装的 `electron-trpc` 是 `0.7.1`；07 基于其实际 `createContext(event)` 路径验证 sender。Anki 文本首行与 APKG 二次导入须先做实机 characterization；[Anki 文本导入说明](https://docs.ankiweb.net/importing/text-files.html)和[包导入说明](https://docs.ankiweb.net/importing/packaged-decks.html)是验收依据。

## 会话交接

每次会话读 `AGENTS.md`、本队列、对应计划、当前代码与测试；其他阶段计划无需预读。记录会话起始 HEAD 作为审查比较基线，先列出最多 10 个依赖有序、可独立检查的阶段。每阶段只改本阶段，跑针对性检查，显式暂存路径，检查 staged diff 与 `git diff --cached --check`，再提交一次。阶段完成后运行 `npm run typecheck && npm test && npm run build`。然后按 `delegated-change-review` 进行一次全新、只读的独立审查：提供比较基线、目标、验收和检查结果；逐项复核发现，采纳的修复逐项验证并提交。审查结束后，在对应计划及本队列记录提交、检查、处理决定和未验证项。若 `better-sqlite3` 因 Electron 构建产生 Node ABI 错误，按 `AGENTS.md` 重建 Node binding 后再检验。不要暂存已有无关修改，也不要自动 push。

若代码事实使后续阶段不成立，仅修订未实施阶段及验收，并记录原因。

## 完成记录

| 会话 | 提交与验证 | 未验证/阻塞 |
| --- | --- | --- |
| 01 | `801be7d`、`7cd0218`、`ff65add`、审查修复 `457aec4`；独立审查 4 项采纳并修复，`npm run ci:verify` 通过（182 测试、类型检查、构建） | 真实 provider、Electron UI 手工操作、打包启动未验证；详见 01 计划 |
| 02 | `174cb6b`、`c2d5976`、`a8a3877`、审查修复 `2d064eb`；独立审查 1 项 P2 已采纳修复；最终 `npm run ci:verify` 通过（192 测试、类型检查、构建），修复后相关 18 测试与 typecheck 通过 | 真实旧版数据库、桌面启动/重启、手工恢复和跨平台运行未验证；详见 02 计划 |
| 03 | `e6d3bf3`、`d88a560`、`c25947b`、审查修复 `a7cfd08`；独立审查 1 项 P0 已采纳修复；最终 `npm run ci:verify` 通过（199 测试、类型检查、构建），修复后相关 57 测试通过 | Electron 桌面手工快速编辑/断开 IPC Retry/重启读回、真实旧版用户数据库 migration、多窗口或跨进程冲突未验证；详见 03 计划 |
| 04 | 待实施 | — |
| 05 | 待实施 | — |
| 06 | 待实施 | — |
| 07 | 待实施 | — |
