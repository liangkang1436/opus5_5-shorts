# opus5_5-shorts（第 1 刀：能出片）

硬核科普短视频 SaaS。客户端将来会是 Web；本刀只做 **制作 Worker + 渲染 Worker**，在本机（或日后服务器）GPU 上跑通「一段话 → 单画幅工程 → mp4」。

## 已定规格（第 1 刀）

| 项 | 定法 |
| --- | --- |
| 画幅 | 开做前选定 **9:16 或 16:9**（不做默认横竖双渲） |
| 分辨率 | 720p / 1080p |
| 帧率 | 30 / 60 |
| 风格 | v1 仅 hardcore |
| 音色 | 默认云希（Edge TTS 等后续接） |
| 模型 | Opus 5.5 `effort=extra`，经 PackyAPI 主密钥（仅服务端） |
| 渲染 | Remotion + Three.js，`--gl=angle-egl`；**不用** Remotion Lambda |
| QA | 不过 → 只回修，绝不强交片 |
| 冒烟片长 | 脚手架 stub 默认 **3 秒**（`fps * 3`），方便第一次真渲几分钟内跑完 |

**本刀不做：** Web UI、短信、微信/支付宝、登录、Redis/多机队列。

## 仓库结构

```
packages/shared/     JobSpec / ProjectStatus / QAResult
packages/pipeline/   单画幅尺寸解析、双画幅断言、QA 门闩
apps/make-worker/    读 job JSON → .data/jobs/<id>/ 脚手架 +（可选）Packy 调用
apps/render-worker/  对已制作的 job 渲 mp4（或 --skip-render）
fixtures/            验收用投料（主动悬挂）
```

## 安装

要求：Node ≥ 20、pnpm 10。

```bash
cd E:\code_space\opus5_5-shorts
pnpm install
# prepare 会自动 build @opus5_5/shared 与 @opus5_5/pipeline
```

### Remotion（真渲必装）

`pnpm install` 只装 monorepo 轻量依赖。真 GPU 出片还需要 Remotion 4.x。两条路任选：

**A. 仓库根（可选，方便本机复用）**

```bash
pnpm run install:remotion
# 等价于：
# pnpm add -w remotion@4.0.539 @remotion/cli@4.0.539 @remotion/renderer@4.0.539 react@19.0.0 react-dom@19.0.0
# pnpm add -wD @types/react@19.0.10 @types/react-dom@19.0.4
# （勿用 @types/react-dom@19.0.10 — npm ETARGET）
```

**B. 按 job 自动装（推荐）**

`make-worker` 写出的 `.data/jobs/<id>/remotion/package.json` 已带齐
`remotion` / `@remotion/cli` / `@remotion/renderer` / `react` / `react-dom`（精确对齐 4.0.539）。
`render-worker` 真渲前若发现 `remotion/node_modules/remotion` 缺失，会**先**在该目录执行 `npm install`（验证 `node_modules/remotion` 存在）；失败再试 `pnpm install --ignore-workspace`。Windows 上不要用裸 `pnpm install`：它会向上走进 monorepo workspace，在 job 目录里装不到东西。

复制环境变量：

```bash
cp .env.example .env
# 填 PACKY_API_KEY（可不填：make-worker 会走 mock stub）
```

## 制作（make-worker）

```bash
# 推荐：用 fixture 干跑（无需 Packy key）
pnpm --filter make-worker start -- fixtures/active-suspension.job.json

# 或根脚本
pnpm make -- fixtures/active-suspension.job.json
```

产物目录：`.data/jobs/<id>/`

- `status.json` — 状态机（`making` → `ready_to_render` 或 `repair_needed`）
- `job.json` — 规范化后的规格
- `script/` — Opus（或 mock）写出的 timeline / 旁白 stub
- `remotion/` — 单 composition 脚手架（仅所选画幅；含 `package.json`、`remotion.config.ts`、`tsconfig.json`、3s 灰底 stub）

无 `PACKY_API_KEY` 时写入明确标注的 mock JSON，不假装成高质量成片脚本。

## 渲染（render-worker）

Windows / 本机 NVIDIA（或服务器 GPU）上用 **`--gl=angle-egl`**（render-worker 已默认带上）：

```bash
# 跳过真渲（CI / 无 GPU）：写占位 mp4 或标记 skipped
pnpm --filter render-worker start -- --job active-suspension-demo --skip-render

# 真渲 3s 冒烟片（需 GPU；首次会在 remotion/ 下自动装依赖）
pnpm --filter render-worker start -- --job active-suspension-demo
```

官方意图命令（angle-egl）：

```bash
cd .data\jobs\active-suspension-demo\remotion
npx remotion render src/index.ts <CompositionId> ../out/final.mp4 --gl=angle-egl
```

`remotion.config.ts` 里默认 `Config.setChromiumOpenGlRenderer("angle")`；CLI 的 `--gl=angle-egl` 会覆盖它，走 Windows GPU 路径。

输出：`.data/jobs/<id>/out/final.mp4`（或 `skipped.json`）。

## 端到端验收（第 1 刀 · Windows LK-DEV）

```bash
cd E:\code_space\opus5_5-shorts
pnpm install
pnpm --filter make-worker start -- fixtures/active-suspension.job.json
# 确认 status.json 为 ready_to_render
pnpm --filter render-worker start -- --job active-suspension-demo --skip-render
# 本机有 NVIDIA GPU 后去掉 --skip-render 真出 3s 冒烟片：
pnpm --filter render-worker start -- --job active-suspension-demo
```

冒烟成功标志：`.data/jobs/active-suspension-demo/out/final.mp4` 存在且 `status.json` 为 `done`。

## 后续刀（范围外）

2. 业务 API + 队列 + 四屏建片路径  
3. 短信登录 + 真实扣费  
4. 套餐 + 微信/支付宝 + 落地页  
5. 压测再采购  


## 坑位备忘（LK-DEV 已验证）

- **Remotion composition `id` 不能含 `_`**：必须用连字符，例如 `Hardcore-1080p-9x16-60`。React 组件导出名另用合法标识符（脚手架固定 `HardcoreSmokeComposition`），不要从 hyphenated id 派生。
- **job 内装 Remotion 用 npm**：`.data/jobs/<id>/remotion` 下优先 `npm install`；裸 `pnpm install` 会走进仓库 workspace，本地 `node_modules` 仍空。
- **`@types/react-dom@19.0.10` 不存在（ETARGET）**：脚手架与 `install:remotion` 钉 `@types/react-dom@19.0.4`，`@types/react@19.0.10` 可保留。

## License

私有，未开源。
