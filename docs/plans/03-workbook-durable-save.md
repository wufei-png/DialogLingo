# 03 · 工作簿可靠保存

状态：已实施。优先级：P0。前置条件：02 完成。

## 交付结果

卡片保存、revision 与版本推进为同一数据库事务；旧请求不能覆盖新版本。Blur autosave 与 Cmd/Ctrl+Enter 共享逐卡保存队列。失败或冲突保留本地草稿并可重试，成功持久化后才显示 Saved 或前进。`Esc` 回到最后一次服务端确认的内容，`Revert` 回到最初生成内容。`Source` 保持只读。

## 现有契约与修改入口

- `src/main/workbook/service.ts` 的 `saveCurrentSnapshot` 先 update 再 insert revision，没有事务或版本条件；`revertItem` 也直接覆盖 current JSON。
- `src/shared/ipc/router.ts` 的 `workbookSaveItem.currentSnapshot` 是 `z.any()`；`src/shared/schemas/workbook.ts` 把快照写为 `z.record(z.any())`。`src/main/index.ts` 的 workbook list/save 返回值尚无 edit version。
- `src/renderer/src/features/workbook/WorkbookCard.tsx` 在 blur 调 `void saveDraft()`，`CardStream.tsx` 前进逻辑依赖 save promise，`WorkbookPage.tsx` 保存后使 query 失效。卡片已实现 Esc、Cmd/Ctrl+Enter、delete/restore/revert。相关测试在 `tests/main/workbook`、`tests/renderer`。
- 02 已提供 migration preflight/backup；本阶段新增 `0005_workbook_item_edit_version.sql`。字段基于现有生成快照与导出消费者核对，保留合法的 `flagged` 等实际使用字段。

## 核心决策

`workbook_items.edit_version INTEGER NOT NULL DEFAULT 0` 是并发令牌。保存 IPC 为 `{itemId,currentSnapshot,baseVersion}`；服务端验证 typed snapshot 并保持持久化 `sourceText` 原值。事务中按 id+版本执行条件更新，更新成功才插入 revision、返回新版号；不匹配返回可区分冲突。Revert 同样推进版本，防止先前在途保存覆盖生成版。客户端逐卡串行并安全合并后续草稿；服务端 CAS 是最后防线。

保存状态由**服务端确认**驱动。失败、冲突、查询刷新均不能抹掉尚未确认的草稿；Retry 不应重放已确认旧稿。Esc 恢复最后确认值；在途请求完成时还需保证不会把较新的本地编辑覆盖。没有新的全局 undo 或显式 Save 主按钮。

## 阶段

1. **版本与原子保存** — 新 migration、共享快照 schema、typed IPC、列表版本字段、事务/CAS save 与 versioned revert。**依赖：** 无。**验收：** 强制 revision insert 失败会回滚 snapshot；重复旧版本保存冲突；Revert 后旧请求无效；Source 不可被 IPC 改写。运行 `npm test -- tests/main/workbook tests/main/db`、`npm run typecheck`。一个本地提交。
2. **逐卡保存生命周期** — Renderer 保存队列、最后确认快照、Saving/Saved/error/Retry 与 aria-live；blur 拒绝处理不产生未处理 promise。**依赖：** 阶段 1。**验收：** 人为乱序与失败时 DB/草稿均符合最后确认状态；刷新 query 不擦除草稿。运行 `npm test -- tests/renderer tests/main/workbook`、`npm run typecheck`。一个本地提交。
3. **快捷键及生命周期回归** — 验证 Cmd/Ctrl+Enter 只在持久化成功后前进，Esc、delete/restore/revert 与失败重试互不冲突。**依赖：** 阶段 2。**验收：** 键盘编辑流程和已有 workbook/export 消费者继续工作；运行 workbook/renderer/export 相关测试及完整 `npm run ci:verify`。一个本地提交。

## 验证与证据范围

测试用可控延迟、异常和两个真实服务调用证明顺序、事务与冲突；只断言回调被调用不足以证明 durable save。桌面手工 QA 覆盖快速编辑、断开 IPC 后 Retry、重启读回；若未执行，记录为未验证。真实来源文本不进入 fixture。

阶段完成并运行完整检查后，按 `delegated-change-review` 做一次新的只读审查；逐项复核发现，采纳修复后复验并提交。审查结束后在[执行队列](reliability-queue.md)及本文填写提交、检查、审查决定和未验证项。

## 完成记录

实施提交：`e6d3bf3`（版本、原子保存与 schema）、`d88a560`（逐卡保存队列）、`c25947b`（保存与生命周期操作串行）、审查修复 `a7cfd08`（以最后确认快照判定脏草稿，阻止未持久化的 Cmd/Ctrl+Enter 前进）。

验证：阶段 1 运行 `npm test -- tests/main/workbook tests/main/db`（15 通过）和 `npm run typecheck`；阶段 2 运行 `npm test -- tests/renderer tests/main/workbook`（40 通过）和 `npm run typecheck`；阶段 3 运行 workbook/renderer/export 相关测试（56 通过）及 `npm run ci:verify`（198 通过）。审查修复后再次运行相关测试（57 通过）和 `npm run ci:verify`（199 通过，含类型检查和构建）。

审查决定：新鲜只读审查发现 1 项 P0——队列草稿回灌会让卡片用显示值而非最后确认值判断脏状态，从而跳过 autosave 并允许前进；已采纳、修复并复验。未采纳项：无。

未验证：未进行 Electron 桌面手工流程（快速连续编辑、断开 IPC 后 Retry、重启读回）；也未在真实旧版用户数据库上执行 migration 或在多窗口/跨进程场景中手工制造冲突。CI 和可控的 SQLite/renderer 队列测试不等于这些运行时验证。
