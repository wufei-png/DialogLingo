# 01 · 模型发送边界与隐私承诺

状态：已实施。优先级：P0。前置条件：无。

## 交付结果

用户能看到 `redactBeforeRemoteSend` 的开关及其有限承诺。开关 ON 时，普通生成、自定义提示词、取消后恢复经过同一个最终模型发送边界；已定义的凭据、鉴权值和 home 路径测试标记不会到达模型适配器。提示词界面清楚区分可编辑模板与一批经同策略处理的示例请求。OFF 仍可使用，但界面明确说明选中 transcript 内容可能进入模型请求。

## 实施前契约与修改入口（历史基线）

- `src/shared/schemas/settings.ts` 和 `src/main/settings/defaults.ts` 已有默认 `true` 的字段；`src/renderer/src/components/SettingsSheet.tsx` 目前只显示 flagged-item export policy，没有此开关。
- `src/main/generation/checkpointStore.ts` 的 `GenerationRunSnapshot` 固定 provider/generation 等非密钥设置，未固定 privacy。`src/main/generation/jobRunner.ts` 发 worker 消息，`src/main/generation/worker.ts` 的 `StartMessage` 不含 policy。
- `src/main/text/turnNoise.ts` 的 `redactSensitiveText` 只识别一类 `sk-*` token，且属于 preclean；`worker.ts` 调用 `enrichCandidateBatch` 前缺少最终脱敏。`src/main/generation/enrichCandidateBatch.ts` 汇合 OpenAI-compatible 与 CLI backend。
- `src/main/generation/promptPreview.ts` 与 `src/main/index.ts` 的 preview endpoint 当前返回模板和候选数，不返回实际渲染批次。`src/main/generation/prompts.ts` 负责将标题和 excerpt 渲染进模板。已有 `tests/main/generation/redaction.test.ts`、`prompt-preview.test.ts`、`checkpoint-store.test.ts` 和 worker 测试可扩展。

## 核心决策

ON 是明确列举模式的保守过滤，不是完全匿名化承诺。覆盖常见 credential token、`Authorization`/鉴权 header 值、明显 secret 环境变量赋值及用户 home 绝对路径；模式和替换方式须有人工合成样本。保留本地索引及 `sourceRef` 原文，不把请求全文写日志。策略在 run snapshot 固定；旧 snapshot 缺字段按 ON 恢复。`apiKey` 本身继续不进入 snapshot。

预览保留可编辑模板，并增加一批明确标为**示例**的已渲染、已脱敏请求。预览与实际发送调用相同 sanitizer；示例不保证未来所有批次的字节内容一致。`promptOverride`、session title 和 excerpt 都要经过最终边界。关闭开关时不做该边界替换，仍保留现有候选清洗。

## 阶段

1. **固定 run 隐私策略** — 扩展 snapshot、worker 消息及恢复路径，加入旧 snapshot 的 ON 回退；设置保存和重启的 on/off 测试覆盖实际持久化。**依赖：** 无。**验收：** 同一任务恢复后仍使用创建时的策略，旧任务有确定回退，不持久化 API key。运行 `npm test -- tests/main/generation/checkpoint-store.test.ts tests/main/generation/job-cancel-resume.test.ts`、`npm run typecheck`。一个本地提交。
2. **最终发送边界** — 在渲染完整 prompt 后、调用 `enrichCandidateBatch` 前执行单一 sanitizer，并覆盖普通/自定义、API/CLI 路径。测试拦截传给模型适配器的**最终 prompt**：ON 的各类 canary 出现次数为零，OFF 符合开关含义；失败/日志无原文。**依赖：** 阶段 1。**验收：** 适配器边界测试通过，不以 sanitizer 单元测试代替发送证据。运行 `npm test -- tests/main/generation`、`npm run typecheck`。一个本地提交。
3. **设置和预览** — 为开关补英文/中文文案；preview IPC 支持当前模板或自定义模板的一批渲染示例，并复用阶段 2 的处理函数。模板编辑能力保持；样本与真实发送的策略一致。**依赖：** 阶段 2。**验收：** 开关、示例标签、预览 canary 和正常生成行为的测试通过。运行 generation/renderer 相关测试和完整 `npm run ci:verify`。一个本地提交。

## 验证与证据范围

用人工合成的 token/header/环境变量/home 路径测试；不要复制真实会话或密钥进 fixture。验证 API 与 CLI 传参，不把 mock 通过说成真实远端 provider 证明。UI 手工检查 ON/OFF、模板修改和示例说明；如不能执行，列为未验证。

阶段完成并运行完整检查后，按 `delegated-change-review` 做一次新的只读审查；逐项复核发现，采纳修复后复验并提交。审查结束后在[执行队列](reliability-queue.md)及本文填写提交、检查、审查决定和未验证项。

## 完成记录

阶段提交：`801be7d`（run 策略快照）、`7cd0218`（最终发送边界）、设置及示例预览（本提交）。

验证：阶段 1 的 checkpoint、取消恢复与设置持久化测试以及 typecheck 通过；阶段 2 的 generation 测试与 typecheck 通过；最终 `npm run ci:verify` 通过（54 个测试文件、182 个测试、类型检查、Electron Vite 构建）。测试使用人工合成 canary，在 API 请求正文及 CLI stdin 处截获最终 prompt；这些结果不代表真实远端 provider 的运行证明。

未验证：未用真实会话或真实 provider 发送；未在 Electron UI 手工核查 ON/OFF、模板编辑与示例布局。已构建，但未做打包启动或跨平台验证。
