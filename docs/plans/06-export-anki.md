# 06 · 导出完整性与 Anki 互操作

状态：已实施。优先级：P1。前置条件：02、03、05 已完成。

## 交付结果

Anki text、generic text 和 APKG 都以完整目录包交付：payload 与可校验的 manifest 一起出现，失败时不会留下貌似成功的最终目录。每次导出有 started/completed/failed 记录及可恢复诊断。Anki 文本首行、字段映射和重复导入行为经 Anki 25.09.5 disposable collection/runtime 验证；APKG 的二次导入行为也有同一实际 runtime 记录。Anki Desktop GUI 手工导入与渲染仍未验证。

## 现有契约与修改入口

- `src/main/index.ts` 现在为每次导出记录 started/completed/failed，并通过共用提交器把三种格式写入 staging 目录、校验后再 rename；APKG 是包含 `.apkg` 与 `manifest.json` 的目录包。
- `src/main/export/ankiTextBundle.ts` 现在输出 `#separator:Tab`、`#html:true`、`#columns` 和 `#tags column` 注释式 headers，不再输出会被旧版 Anki 当作伪 note 的普通列名行。[Anki 文本导入文档](https://docs.ankiweb.net/importing/text-files.html)是 headers 与字段映射依据；[包导入说明](https://docs.ankiweb.net/importing/packaged-decks.html)是 APKG 二次导入行为依据。
- `src/main/export/manifest.ts` 已升级为带 run ID、策略、排除/警告计数和 payload SHA-256 的 v2；`genericTextBundle.ts` 的 CSV 仍包含可能带 transcript 内容的 `sourceRefs`，renderer 已给出分享前检查提示。
- 02 的备份/迁移基础已可用于新 `0006_export_run_status.sql`。03 的工作簿 typed snapshot 是导出字段来源。

## 核心决策

三种格式都先在目标文件系统创建仅本应用命名的临时目录，写完 payload，计算每个 payload 的 `sizeBytes` 和 SHA-256，写 manifest v2 并校验，再原子 rename 至唯一最终目录。APKG 目录包含实际 `.apkg` 文件与 `manifest.json`，UI 展示/揭示其内部文件。manifest 自身不列入 checksum。v2 记录 run ID、app/schema version、policy、selected/exported/excluded counts、warning codes、平台汇总及相对文件清单；不写原文 excerpt。Generic CSV 的来源字段可能包含 transcript 内容，导出确认界面给出明确提示。

`export_runs` 在写入前记录 started，成功后 completed，异常记 failed 和有限错误代码。rename 后、DB 完成更新前崩溃可能留下完整目录与 started 记录；启动时只对本应用命名的目录做核对和诊断，不猜测性删除未知目录或现有成功产物。原 v1 bundle 保持可读，不改旧导出。普通首行是否产生伪卡片和 APKG GUID/二次导入须用 Anki 实机验证，不能仅从字符串/库实现推断。

## 阶段

1. **导出运行状态** — 已完成，提交 `bf42301`。新增 `0006_export_run_status.sql`、started/completed/failed 生命周期、有限错误分类，并为旧记录回填 completed 与时间戳。阶段检查：`npm test -- --run tests/main/export/export-run-status.test.ts tests/main/db/migrate.test.ts tests/main/db/upgrade.test.ts`（14 tests）和 `npm run typecheck` 通过；staged diff 已检查且 `git diff --cached --check` 通过。
2. **目录提交与可核验清单** — 已完成，提交 `9d7895d`。三格式共用 staging→hash→manifest→verify→rename；加入失败清理、v1 读取兼容、started 目录诊断、manifest/file list UI 和 generic CSV 隐私警告。阶段检查：`npm test -- --run tests/main/export tests/renderer`（23 files / 67 tests）和 `npm run typecheck` 通过；staged diff 已检查且 `git diff --cached --check` 通过。
3. **Anki 实际导入契约** — 已完成，提交 `cce8872`。在 Anki 25.09.5 的 disposable collection/runtime 中先复现普通列名行生成伪 note，再加入注释式 headers；最终 expression 导入为 1 note，字段映射为 `Front, Back, Gloss, Context, Explanation, Quiz, _tags`，HTML 与 tags 保留，第二次 text 导入为 1 unchanged。APKG 两次导入保持 2 notes / 2 cards，第二次报告既有条目为 up-to-date。阶段检查：`npm test -- --run tests/main/export`（10 files / 26 tests）、`npm run typecheck`、`npm run ci:verify` 通过；最终全量为 62 files / 223 tests，build 通过；staged diff 已检查且 `git diff --cached --check` 通过。

## 验证与证据范围

故障注入覆盖 payload-write、manifest-write、verify 和 rename；相关测试确认 staging 清理且不出现最终目录。export run store 单测覆盖 DB 生命周期，启动诊断只读核对本应用命名目录，不猜测性删除。atomic rename 只保证对外可见的目录完成边界，不代表断电持久性。真实 Anki 样本使用合成牌组和一次性 collection/runtime，不操作用户自己的牌组；生成的 TSV/APKG 保留在临时目录，未进入仓库。不可把真实来源引用或导出文件提交进仓库。

阶段完成并运行完整检查后，按 `delegated-change-review` 启动了两次新的只读审查任务；两者在多次有界等待后均未返回最终意见，随后停止，不能将其解释为 `No findings` 或审查通过。对当前 diff 的本地只读复核未确认 P0–P3 缺陷，因此没有审查修复提交；这一审查代理未完成状态列入未验证项。

## 完成记录

已实施。

### 提交与验证

- 阶段 1：`bf42301`（`feat: track export run status`）。目标测试、typecheck、staged diff 与 whitespace 检查通过。
- 阶段 2：`9d7895d`（`feat: commit verified export bundles atomically`）。export/renderer 目标测试、typecheck、staged diff 与 whitespace 检查通过。
- 阶段 3：`cce8872`（`feat: align Anki text imports with file headers`）。export 目标测试、typecheck、完整 `npm run ci:verify`、staged diff 与 whitespace 检查通过。
- 审查：未产生修复提交；两个 delegated review 任务都没有返回最终结论，本地复核没有确认需要修复的 P0–P3 问题。

### Anki 证据

- 环境：macOS，Anki 25.09.5 的实际导入 runtime；使用 disposable collection/profile 和合成 expression/sentence 数据，用户原有 profile 未操作。
- Text：旧普通 `Front\tBack...` 列名行会被当作数据；headers 版本不产生伪 note。使用六个内容字段的 DialogLingo note type 时，末列自动映射到 Anki tags；开启 Allow HTML 后 `<br>` 与 HTML-safe 内容保持；第二次导入报告 1 unchanged。
- APKG：第一次导入 2 notes / 2 cards；相同 APKG 第二次导入仍为 2 notes / 2 cards，并报告 notes skipped as up-to-date copies。

### 未验证项

- 未完成 Anki 桌面 GUI 的手工点击导入/渲染检查；本次是 Anki 25.09.5 的 disposable collection/runtime 实际导入验证。
- 未验证断电/强制终止、跨平台 rename/文件锁、真实 Electron 打包启动和完整桌面端导出流程。
- delegated review 代理没有返回最终结论；本地 read-only 复核未确认 P0–P3 缺陷，不能替代代理的 `No findings` 证据。
- APKG 仍由现有第三方 exporter 生成 Basic 风格 Front/Back 卡片；本阶段验证其导入完整性与重复导入行为，没有把它扩展为带全部 workbook 字段的自定义 Anki note type。
