# 02 · 数据库完整性与迁移恢复

状态：已实施。优先级：P0。前置条件：01 完成。

## 交付结果

每个应用数据库连接明确启用 SQLite 外键。已有数据库先接受完整性和外键检查；存在新 migration 时先保留一致性备份。检查、备份或迁移失败时，启动给出可诊断错误，原始数据库和备份仍可供恢复。历史库可升级并继续搜索、查看工作簿与导出记录。

## 实施前基线与修改入口

以下描述对应实施前的 `457aec4`，当前行为以代码和下方完成记录为准。

- `src/main/db/client.ts` 的 `createDb` 当时打开 `better-sqlite3` 连接但不设置 `foreign_keys`。`src/main/settings/service.ts` 使用它；`src/main/workbook/service.ts` 当时另行打开连接；`src/main/index.ts` 有主连接。
- `src/main/db/migrate.ts` 当时先创建 `schema_migrations` 表，再遍历 `0000`–`0004` migration；单个 migration 在事务中执行，但没有升级前检查和备份。`src/main/db/migrations/0000_initial.sql` 中多表使用 FK/CASCADE。
- `tests/main/db/migrate.test.ts` 当时主要验证空库迁移和重复运行。`tests/main/testDb.ts` 是数据库测试入口。业务 migration `0005`、`0006` 分别属于后续 03、06，必须在本计划完成后引入。

## 核心决策

统一**连接配置入口**，不要求所有服务共用同一个物理连接。检查 `PRAGMA integrity_check` 与 `PRAGMA foreign_key_check`，二者不能互相替代。识别 pending migration 要在首次写入 `schema_migrations` 前完成。已有库一旦检查失败即停止写入并报告问题；不自动清理孤儿行。磁盘库有 pending migration 时，以 `VACUUM INTO` 一类一致性快照生成受控 backup；备份失败则不迁移。失败后不自动恢复覆盖原库，也不删除恢复点。内存库按测试专用路径处理。

## 阶段

1. **只读预检与备份** — 拆开 pending 检测和 schema 写入；实现已有磁盘库的 integrity/FK preflight 与 pending-migration snapshot，备份路径位于应用 user data 的受控目录。**依赖：** 无。**验收：** 无 pending 时不产生备份；异常/损坏/备份写入失败时不进入 migration；快照与原库可检查。使用临时磁盘数据库做故障注入，运行 `npm test -- tests/main/db`、`npm run typecheck`。一个本地提交。
2. **逐连接外键契约** — 主、settings、workbook 都经已配置入口打开连接并断言 `foreign_keys=1`；确保既有测试/临时库路径不误用用户备份流程。**依赖：** 阶段 1。**验收：** 每个服务连接上 FK 删除/拒绝行为真实生效，正常启动和 workbook/settings 冒烟通过。运行 DB、settings、workbook 相关测试及 `npm run typecheck`。一个本地提交。
3. **历史升级与失败恢复证明** — 构造迁移停在 `0000`、`0002`、`0004` 的数据库，插入代表性项目、会话、工作簿、导出记录并升级；覆盖 FTS、`integrity_check='ok'`、`foreign_key_check` 零行及中途失败时原库/快照可用。**依赖：** 阶段 2。**验收：** 升级后数据仍可查询；旧库违反 FK 时只报错不猜测性修复。运行 `npm test -- tests/main/db tests/main/search tests/main/workbook` 和完整 `npm run ci:verify`。一个本地提交。

## 验证与证据范围

磁盘故障/快照测试不能仅用 `:memory:` 代替。使用人工构造的历史数据库，不提交真实 `dialoglingo.db` 或备份。`VACUUM INTO` 产生一致快照不意味着已经演练了用户手工恢复；若没有桌面旧库启动与重启 QA，应标为未验证。

阶段完成并运行完整检查后，按 `delegated-change-review` 做一次新的只读审查；逐项复核发现，采纳修复后复验并提交。审查结束后在[执行队列](reliability-queue.md)及本文填写提交、检查、审查决定和未验证项。

## 完成记录

阶段提交：`174cb6b`（只读预检、备份与事务迁移）、`c2d5976`（逐连接外键）、`a8a3877`（历史升级与恢复测试）。审查修复：`2d064eb`（测试在清理磁盘 fixture 前关闭服务连接）。

验证：阶段 1 的 DB 测试与 typecheck、阶段 2 的 DB/settings/workbook 测试与 typecheck、阶段 3 的 DB/search/workbook 测试均通过。审查修复后重跑 DB/settings/workbook 共 18 个测试及 typecheck，并对最终代码重跑 `npm run ci:verify`；后者通过 55 个测试文件、192 个测试、类型检查和 Electron Vite 构建。暂存差异均经检查，`git diff --cached --check` 通过。

独立只读审查对比 `457aec4` 至 `a8a3877`。一项 P2 发现已复核并采纳：磁盘测试在 SQLite 服务连接未关闭时删除临时目录，Windows 可能因文件锁失败；修复后复验通过。无拒绝项。审查未发现生产迁移或恢复逻辑缺陷。

未验证：测试旧库由当前仓库的 `0000`–`0004` migration 人工构造，未用真实旧版安装生成的数据库；未做桌面旧库启动、重启、用户手工恢复或跨平台运行。构建通过不等于这些场景已验证。
