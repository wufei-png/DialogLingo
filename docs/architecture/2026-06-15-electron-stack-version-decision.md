# DialogLingo Electron 技术栈版本收敛

> **文档用途**：供 AI / 人类做升级决策时直接引用。  
> **调研基准日**：2026-06-15  
> **执行校准日**：2026-06-16  
> **决策前项目现状**：Electron ^29.4.6、better-sqlite3 ^12.10.1、已有 Node/Electron 双 binding 脚本。
> **状态**：Accepted with fallback. 当前执行层先 pin `Node@24.15.0` + `Electron@41.7.2` + `better-sqlite3@12.10.1`，待 `better-sqlite3@12.11.0` 正式发布并确认 Electron 42 prebuild 后再升级。

---

## 决策摘要（30 秒版）

| 决策项 | 推荐 |
|---|---|
| Node (dev/CI) | **24.15.0**（过渡基线，ABI 137） |
| Electron | **41.7.2**（当前可执行基线；EOL 2026-08-25，需尽快规划 42/43） |
| better-sqlite3 | **12.10.1**（精确 pin；`12.11.0` 发布后再评估升级，禁止 12.10.0 + E42） |
| @electron/rebuild | **4.0.4** |
| electron-vite | **5.0.0** |
| electron-trpc | **0.7.1** |
| ABI 能否统一 | **不能**；只能双 binding + 测试分层 |

---

## 1. 当前可执行版本矩阵

| 组件 | 锁定版本 | 证据来源 | 风险 | 是否建议立即采用 |
|---|---|---|---|---|
| **Node (dev/CI)** | **24.15.0** | 与 Electron 41.7.2 的 Node 24.15.0 基线对齐；NODE_MODULE_VERSION **137** | 后续升 Electron 42 时再评估 24.16.0 | **是** |
| **Electron** | **41.7.2** | [Electron releases](https://releases.electronjs.org/)；`better-sqlite3@12.10.1` 当前有 `electron-v145` prebuild | EOL **2026-08-25**，需要尽快升级到 42/43 | **是** |
| **better-sqlite3** | **12.10.1** | npm registry 当前 latest 为 12.10.1；[v12.10.1](https://github.com/WiseLibs/better-sqlite3/releases) 修 Electron 42 相关 V8 API 问题 | Electron 42 `electron-v146` prebuild 当前缺失；Electron 41 `electron-v145` prebuild 可用；**禁止 12.10.0**（[#1470 回滚](https://github.com/WiseLibs/better-sqlite3/pull/1470)） | **是** |
| **@electron/rebuild** | **4.0.4** | [npm](https://www.npmjs.com/package/@electron/rebuild) — 要求 Node 22.12+；支持 prebuild-install | 低 | **是** |
| **electron-vite** | **5.0.0** | [Getting Started](https://electron-vite.org/guide/) — Node 20.19+/22.12+；自动匹配 Electron node/chrome target | 低 | **是** |
| **electron-trpc** | **0.7.1** | [npm peerDeps](https://www.npmjs.com/package/electron-trpc) — `electron > 19` | 包更新不活跃（2024-12），但 API 稳定 | **是** |
| **@types/node** | **24.13.2** | 当前可安装的最新 24.x 类型包；运行时 Node 锁 24.15.0 | 低 | **是** |

### Electron ABI 对照（native module 关键）

来源：[electron/node-abi abi_registry.json](https://github.com/electron/node-abi/blob/main/abi_registry.json)

| Electron | Electron ABI | 内置 Node（release 初始） |
|---|---|---|
| 40.x | 143 | 24.11.1 |
| 41.x | 145 | 24.14.0 |
| 42.x | **146** | 24.15.0 → 42.4.0 为 **24.16.0** |

### better-sqlite3 prebuild 状态

2026-06-16 校准：npm registry 当前只发布到 `12.10.1`，未发布 `12.11.0`。因此执行层不能引用 `12.11.0`，也不能声称 Electron 42 `electron-v146` prebuild 必然命中。

当 `12.11.0` 正式发布后，再按以下目标校验：

- **Node 24**：`node-v137`（darwin/linux/win；Node runtime 含 linux-arm）
- **Electron 42**：`electron-v146`（darwin-arm64/x64, linux-arm64/x64, win32-x64）
- **Electron 41**：`electron-v145`
- **Electron 40**：`electron-v143`
- **无** `electron-v146-linux-arm`（Electron 42 已移除 Linux IA32）

### 目标升级矩阵（fallback，非当前执行基线）

| 组件 | 版本 | 说明 |
|---|---|---|
| Node | 24.16.0（或继续 24.15.0，ABI 同为 137） | Electron 42.4.0 内置 Node 24.16.0，可随 Electron 42 升级 |
| Electron | **42.4.0** | 当前 latest stable；EOL **2026-10-20**；需要 `electron-v146` prebuild 或可用本机编译工具链 |
| better-sqlite3 | **12.11.0** | 发布并确认 Electron 42 prebuild 后升级 |

### 明确不推荐

- Node 20.x（EOL 2026-04-30）
- Electron 29.x（项目现状，早已出支持窗口）
- Electron 40.x 作新基线（EOL 2026-06-30）
- better-sqlite3 12.10.0 + Electron 42
- better-sqlite3 < 12.10.1 + Electron 42（V8 编译失败，[#1474](https://github.com/WiseLibs/better-sqlite3/issues/1474)）
- 期望单一 `.node` 同时服务 Node test 与 Electron runtime

---

## 4. package.json 示例

```json
{
  "name": "dialoglingo",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "dist-electron/main/index.js",
  "engines": {
    "node": "24.15.0"
  },
  "scripts": {
    "postinstall": "npm run rebuild:native:node && npm run capture:native:node",
    "rebuild:native:node": "npm rebuild better-sqlite3",
    "rebuild:native:electron": "electron-rebuild -f -w better-sqlite3",
    "capture:native:node": "node scripts/capture-node-better-sqlite3.mjs",
    "prepare:native:electron": "node scripts/prepare-electron-better-sqlite3.mjs",
    "dev": "npm run prepare:native:electron && node scripts/run-electron-vite-dev.mjs",
    "build": "npm run prepare:native:electron && electron-vite build",
    "test": "vitest run",
    "test:electron:smoke": "npm run build && electron scripts/smoke-db.mjs"
  },
  "dependencies": {
    "better-sqlite3": "12.10.1",
    "drizzle-orm": "^0.45.2",
    "electron-trpc": "0.7.1",
    "@trpc/client": "^10.45.2",
    "@trpc/server": "^10.45.2"
  },
  "devDependencies": {
    "@electron/rebuild": "4.0.4",
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "24.13.2",
    "electron": "41.7.2",
    "electron-vite": "5.0.0",
    "typescript": "^5.8.3",
    "vite": "^7.0.0",
    "vitest": "^2.1.9"
  }
}
```

配套文件 `.nvmrc` / `.node-version`：

```
24.15.0
```

**pin 策略说明**：
- `better-sqlite3`、`electron`、`@electron/rebuild`、`electron-vite`、`electron-trpc` 用精确版本（无 `^`）
- `drizzle-orm` 等纯 TS 依赖可保持 `^`

---

## 5. postinstall / rebuild 建议

### 核心原则

1. **postinstall 只保证 Node ABI**（供 Vitest / `tsx` / 迁移脚本）
2. **dev/build 前执行 electron-rebuild**（供 Electron main 进程）
3. **不能取消 electron-rebuild** — [Electron 官方文档](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules) 明确要求针对 Electron ABI 重编译

### 流程

```
npm install
  → npm rebuild better-sqlite3          # Node ABI 137
  → capture → better_sqlite3.node-runtime.node

npm run dev / build
  → electron-rebuild -f -w better-sqlite3   # Electron ABI 146
  → copy → better_sqlite3.electron.node
  → restore node snapshot → better_sqlite3.node
```

### 操作要点

| 规则 | 原因 |
|---|---|
| postinstall **不要**默认 `electron-rebuild` | 否则 Vitest 拿到 Electron ABI，Node 测试失败 |
| `electron-rebuild` 使用 `-f -w better-sqlite3` | 仅重建目标模块，与项目现有 `scripts/prepare-electron-better-sqlite3.mjs` 一致 |
| 有 prebuild 时走 `prebuild-install`；失败则 `--build-from-source` | 需本机 node-gyp 工具链（Xcode CLT / VS Build Tools 等） |
| CI 可缓存 `~/.electron-gyp` | 加速源码编译 fallback |
| 每次升级 Electron major/minor 后重跑 `prepare:native:electron` | ABI 变化 |

### 项目现有脚本映射（可复用）

| 脚本 | 职责 |
|---|---|
| `scripts/capture-node-better-sqlite3.mjs` | 保存 Node binding 快照 |
| `scripts/prepare-electron-better-sqlite3.mjs` | electron-rebuild + 双 binding 交换 |
| `src/main/db/client.ts` | Electron runtime 读取 `better_sqlite3.electron.node` |

---

## 6. CI smoke test 建议

### 测试分层

| 层级 | 运行环境 | 测什么 | 要求 |
|---|---|---|---|
| **L1 单元/逻辑** | Node 24 + Vitest | 纯函数、schema、ranking 等 | **不** import `createDb()` |
| **L2 DB 逻辑** | Node 24 + Vitest | SQL、迁移、查询 | 用 `tests/main/testDb.ts` 独立 `:memory:` 工厂；依赖 postinstall Node rebuild |
| **L3 集成** | Electron main | 真实 `createDb()` + drizzle + 文件 DB | `electron scripts/smoke-db.mjs` 或启动 app 断言 |
| **L4 打包** | CI matrix | darwin-arm64, linux-x64, win-x64 | electron-rebuild + 最小启动断言 |

### 禁止做法

- Vitest 顶层 `import { createDb } from 'src/main/db/client'`（会走 Electron binding 路径）
- 假设 `npm test` 覆盖 Electron native 加载路径
- 在普通 Node 环境跑依赖 Electron ABI 的 smoke test

### GitHub Actions 示意

```yaml
jobs:
  test-node:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '24.15.0'
      - run: npm ci
      - run: npm test

  smoke-electron:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '24.15.0'
      - run: npm ci
      - run: npm run prepare:native:electron
      - run: npm run build
      - run: npx electron scripts/smoke-db.mjs
```

### `scripts/smoke-db.mjs` 最小职责（待实现）

1. 创建临时 DB 文件
2. 执行 migration
3. 一次读写断言
4. 退出码 0 / 非 0

---

## 7. Node 测试 ABI 与 Electron ABI 能否真正统一？

### 明确判断：**不能统一，只能隔离。**

### 依据

1. **Electron 官方**：[Native Node Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)  
   Electron 与 Node **ABI 不同**（BoringSSL、V8 补丁等），native module 必须针对 Electron recompile，否则报 `NODE_MODULE_VERSION` 不匹配。

2. **ABI 数值不同**（[node-abi registry](https://github.com/electron/node-abi/blob/main/abi_registry.json)）：

   | Runtime | ABI |
   |---|---|
   | Node 24.x | **137** |
   | Electron 42.x | **146** |

3. **即使 Electron 42.4.0 内置 Node 24.16.0**，native `.node` 的 MODULE_VERSION 仍不同 — 同 Node 版本号 ≠ 同 ABI。

### “ABI 收敛”实际能做到的

| 能做到 | 做不到 |
|---|---|
| 固定小版本矩阵，减少意外漂移 | 一份 `better_sqlite3.node` 同时跑 Vitest 和 Electron |
| 依赖 upstream prebuild，减少本地编译 | 取消 `electron-rebuild` |
| 双 binding 快照（项目已实现） | 让 `npm rebuild` 替代 `electron-rebuild` |
| 测试分层：Node 测逻辑，Electron 测真实 DB | |

### 对 AI 决策的指令

- **接受**双 binding 方案为长期架构，而非临时 hack
- **拒绝**任何“只维护一套 native 产物”的简化提案
- **升级时**同时验证：postinstall（Node）+ prepare:native:electron（Electron）+ L3 smoke

---

## 建议升级路径（供 AI 编排任务）

| Phase | 动作 | 验收 |
|---|---|---|
| **0** | 锁 Node 24.15.0 + better-sqlite3 12.10.1 + @electron/rebuild 4.0.4 | `npm ci` + `npm test` 通过 |
| **1** | 升 Electron 41.7.2（当前执行基线） | `electron-v145` prebuild 命中；smoke 通过 |
| **2** | 升 Electron 42.4.0 | `electron-v146` prebuild 命中或本机 rebuild 成功；smoke 通过 |
| **3** | 2026 Q3 跟踪 Electron 43 stable + better-sqlite3 prebuild | 避免停在 EOL 的 42 |

---

## 关键链接索引

- Node Release Schedule: https://github.com/nodejs/Release/blob/main/README.md
- Electron Schedule: https://releases.electronjs.org/schedule
- Electron 42.4.0: https://releases.electronjs.org/release/v42.4.0
- Electron Native Modules: https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules
- better-sqlite3 npm: https://www.npmjs.com/package/better-sqlite3
- better-sqlite3 releases: https://github.com/WiseLibs/better-sqlite3/releases
- better-sqlite3 E42 问题 #1474: https://github.com/WiseLibs/better-sqlite3/issues/1474
- electron/node-abi: https://github.com/electron/node-abi/blob/main/abi_registry.json
- @electron/rebuild: https://www.npmjs.com/package/@electron/rebuild
- electron-vite: https://electron-vite.org/guide/
- electron-trpc: https://www.npmjs.com/package/electron-trpc
