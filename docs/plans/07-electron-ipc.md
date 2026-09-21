# 07 · Electron 与 IPC 边界

状态：已实施（2026-09-21）。优先级：P1。前置条件：03、06 已核实完成。

## 交付结果

只有受信任的应用窗口/主 frame 能调用有读写权限的 tRPC procedure；无效负载在到达 service 前被拒绝。渲染进程有明确 sandbox、CSP 和导航/新窗口限制。开发运行与打包运行的 preload、工作簿、导出流程仍可用。

## 实施前基线与修改入口

- `src/main/index.ts` 建立 `BrowserWindow` 并调用 `createIPCHandler`；实施前只有 `contextIsolation: true`，没有显式 sandbox、navigation/new-window deny 或 CSP。`src/preload/index.ts` 暴露 electron-trpc 与经过 schema 解析的事件。
- 实施前 router 仍有宽泛输入；本阶段清点了**所有** privileged procedure，当前统一使用 bounded shared Zod schema，且 export 路径/输出名由主进程做语义校验。
- 安装版 `electron-trpc@0.7.1` 的 `createContext` 可得到 IPC event，但内部使用全局 channel；`attachWindow` 不是完整 sender 授权。若直接在 `createContext` 中抛错，须核实库的异常处理位置，避免未处理拒绝。可在 context 标记验证结果并于 tRPC middleware 拒绝。
- [Electron 安全说明](https://www.electronjs.org/docs/latest/tutorial/security)推荐 CSP、renderer sandbox、限制导航/新窗口及 IPC sender 验证。Electron 的默认 sandbox 不代替应用显式声明。

## 核心决策

以已创建的应用窗口 webContents 与预期 top-level frame/origin 共同验证调用者；开发 URL 与打包页面各有严格允许条件，拒绝 iframe/未知窗口。通过 tRPC middleware 或等价的统一入口在 service 执行前拒绝非法 sender。所有 privileged 输入使用 bounded shared Zod schema，路径与输出名还须在主进程做语义验证；类型检查不等于路径授权。CSP 必须同时适配开发服务器和生产静态资源，生产规则尽量收紧。意外外链与新窗口默认拒绝；若产品确需外链，显式限定目标及处理器。

## 阶段

1. **IPC 输入与 sender** — 清点 procedure，补齐共享 runtime schema；在 electron-trpc context/middleware 验证 sender、frame、允许页面。**依赖：** 无。**验收：** 未知窗口、子 frame、错误 origin 或恶意请求不会触发 DB/文件服务；正常 workbook/export 仍通过。运行 shared/main IPC 测试及 `npm run typecheck`。一个本地提交。
2. **窗口策略与打包检验** — 显式 sandbox、CSP、navigation/new-window deny，验证开发和 packaged preload 行为；同步 v1 spec 的当前实现快照与仍未验证的发布门。**依赖：** 阶段 1。**验收：** 生产资源加载和交互可用，非允许导航/新窗口被阻止，`npm run ci:verify` 通过；记录实际可运行平台的 packaged launch/export smoke。一个本地提交。

## 验证与证据范围

静态 schema 测试不证明 Electron sender 拦截，构建成功也不证明 packaged preload 正常。若受 host 限制不能运行 packaged app，记录未验证平台及阻塞；不能把 macOS 单机冒烟称为 Windows/Linux 证明。签名/公证属于后续发布任务。

阶段完成并运行完整检查后，按 `delegated-change-review` 做一次新的只读审查；逐项复核发现，采纳修复后复验并提交。审查结束后在[执行队列](reliability-queue.md)及本文填写提交、检查、审查决定和未验证项。

## 完成记录

### 阶段 1 · IPC 输入与 sender

- 提交：`b114a52`（`feat: secure ipc sender and inputs`）。
- 结果：注册的应用窗口、top-level frame、预期 dev/package 页面共同授权；统一 IPC middleware 在 service 前拒绝非法 sender；所有 privileged procedure 使用有界共享 schema；导出路径与输出名进行主进程语义校验。
- 验证：sender/router/export 相关测试 17/17；`npm run typecheck`；`npm run ci:verify`（64 个测试文件、234 个测试、类型检查、构建）；暂存 diff 与 `git diff --cached --check` 均通过。

### 阶段 2 · 窗口策略与构建检查

- 提交：`ea81dca`（`feat: harden electron renderer windows`）。
- 结果：显式 `contextIsolation`、sandbox、禁用 renderer Node 能力与不安全内容；开发/生产 CSP 分开；阻止非允许导航、新窗口和 webview。生产 build 输出的 renderer HTML 已核对为收紧后的 CSP。
- 验证：窗口安全测试 9/9；`npm run typecheck`；`npm run ci:verify`（65 个测试文件、237 个测试、类型检查、构建）；暂存 diff 与 `git diff --cached --check` 均通过。
- 冒烟：使用当前 `dist-electron` 直接启动 Electron，日志确认 app ready、renderer finished loading；本机历史会话扫描随后因某个 JSONL 超过 Node 单字符串上限而失败，因此没有把它记作可用 UI/导出端到端证据。`npm run package:mac` 已在 macOS arm64 上实际尝试，但 Electron 41.7.2 下载等待 600 秒超时，未生成可归因于本次代码的 DMG/ZIP。

### Delegated review 与修复复验

- 比较基线：`1307758`；审查范围为 `1307758..ea81dca`，代理只读且未修改工作树。
- 审查发现 5 项 P1–P3：开发 React Refresh 内联 preamble 被 CSP 拦截、缺少 `will-redirect` 防线、lambda 非有限/无上限、IPC 上限直接污染持久化 settings schema、IPv6 loopback 主机名格式不兼容。5 项均经独立复核后采纳。
- 逐项修复提交：`d30fc60`、`2376f19`、`0b6f4c5`、`f6c4eab`、`a5c48ea`。
- 修复后验证：`npm run ci:verify` 通过（65 个测试文件、242 个测试、类型检查、构建）；build 后 `better-sqlite3` Node ABI 检查通过；生产 CSP 再次核对；每个修复提交前均检查 staged diff 与 `git diff --cached --check`。当前没有未处理的审查 P0–P3 发现。

### 未验证项与边界

- 当前代码未取得成功的、由本次构建产生的 DMG/ZIP packaged launch/export 证据；Windows/Linux packaged launch、跨平台文件锁/rename、签名与公证也未验证。
- 未做真实 Electron/electron-trpc 攻击 sender、iframe、重定向和新窗口的运行时自动化；sender/router/window 测试是纯逻辑或 mock 级证据。
- 未做 dev server + React Refresh 的真实 UI 冒烟，只有 dev CSP 单测与生产 build 产物检查。
- 未完成真实 provider、Anki GUI 手工导入/渲染、断电恢复及完整桌面端导出流程；这些沿用队列前序阶段的开放证据门。
