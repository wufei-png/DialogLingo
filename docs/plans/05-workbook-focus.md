# 05 · 工作簿键盘焦点

状态：已实施。优先级：P1。前置条件：03 完成，04 已交接。

## 交付结果

卡片选中状态与实际 DOM 焦点一致。j/k/上下箭头在非编辑态移动选择并聚焦新卡片；Enter 进入主要可编辑字段。卡内字段和按钮保持正常 Tab 顺序，输入时 j/k/方向键与删除键按文本编辑含义工作。焦点及 03 的保存状态对键盘和读屏用户可见。`Source` 保持只读。

## 现有契约与修改入口

- `src/renderer/src/features/workbook/WorkbookPage.tsx` 在 window 上监听快捷键，并用 selection focus revision 驱动卡片焦点；Enter 增加 `focusTargetRevision`。
- `CardStream.tsx` 用虚拟列表滚动至 selected index，并在卡片 mounted 后重试聚焦对应 anchor。`WorkbookCard.tsx` 提供卡片级键盘 anchor，Enter 聚焦 target 字段。
- `src/renderer/src/styles.css` 提供选中样式与可见焦点环；03 提供 Saving/Saved/error/Retry，当前错误状态独立展示详情和重试按钮。`tests/renderer` 已加入基于 jsdom 的真实 `document.activeElement` 组件测试。
- 当前 v1 spec 的 Source 只读与 provenance 高亮契约继续有效。不要把含多个输入控件的卡片直接伪装成简单 `listbox/option`。

## 核心决策

以卡片级 focus anchor 实现 roving `tabIndex`：当前选中卡片为 0，其余 -1。导航后先让虚拟卡片进入视图，再聚焦对应 anchor；处理滚动与异步挂载竞争。selection 与 focus 的视觉状态可区分，焦点环明确。Enter 进入主编辑字段；Tab 按 DOM 顺序进入可操作元素。03 的保存错误提示使用可感知状态，不因自动聚焦而遮挡或清除草稿。

## 阶段

1. **组件焦点契约** — 引入适合当前 Vitest/React 的 DOM 测试环境，增加卡片 anchor 与虚拟列表 mounted 后的焦点转移。**依赖：** 无。**验收：** j/k/Arrow 后 `document.activeElement` 是所选卡片 anchor，包括跨出当前虚拟窗口；非选中卡片不能额外占据 Tab 序列。运行 `npm test -- tests/renderer`、`npm run typecheck`。一个本地提交。
2. **快捷键、样式与读屏回归** — Enter/Tab/Esc、编辑输入、删除/恢复及保存状态的焦点和视觉测试；键盘可见焦点与 aria-live 文案。**依赖：** 阶段 1。**验收：** 不劫持输入中的文本键；键盘-only 可完成选择、编辑、失败重试、删除/恢复、打开来源与导出。运行 renderer/workbook 测试和完整 `npm run ci:verify`。一个本地提交。

## 验证与证据范围

model 测试不能代替 DOM 焦点测试；组件测试也不能代替真实 Electron 键盘检查。桌面 QA 至少用键盘走完一条工作簿流程，报告系统、构建和未验证动作。保持 Source 只读，不借此阶段扩张卡片编辑字段。

阶段完成并运行完整检查后，按 `delegated-change-review` 做一次新的只读审查；逐项复核发现，采纳修复后复验并提交。审查结束后在[执行队列](reliability-queue.md)及本文填写提交、检查、审查决定和未验证项。

## 完成记录

- 实施提交：`5235554`（组件焦点契约与 DOM 测试环境）、`276f38f`（快捷键、样式、读屏状态与键盘回归测试）。审查后无额外修复提交。
- 阶段验证：阶段 1 的 `npm test -- tests/renderer`（12 个测试文件、39 项测试）与 `npm run typecheck` 通过；阶段 2 的 `npm test -- tests/renderer`（13 个测试文件、41 项测试）、`npm run typecheck` 与 `npm run ci:verify` 通过。完整验证为 59 个测试文件、212 项测试、类型检查和 Electron build；每个阶段均检查 staged diff 与 `git diff --cached --check`。
- 独立审查：以会话起始 HEAD `c6b3838` 为比较基线，审查结论为 `No findings.`；没有采纳的 P0–P3 发现，因此无需修复复验。
- 未验证：未做真实 Electron/Chromium 桌面键盘 QA；ArrowUp/ArrowDown、完整 Tab 遍历，以及导出、查看来源、删除/恢复、失败重试的端到端手工流程未逐项实机验证。虚拟列表跨窗口测试使用 JSDOM 的模拟尺寸与 RAF，不等同于真实浏览器布局证明。Source 仍保持只读。
