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
cd opus5_5-shorts
pnpm install
# prepare 会自动 build @opus5_5/shared 与 @opus5_5/pipeline
```

Remotion 全家桶较重，第 1 刀把 `@remotion/*` 标为可选；本机真渲前再装：

```bash
pnpm add -w remotion @remotion/cli @remotion/renderer
# 或在 render-worker 目录按官方文档安装
```

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
- `remotion/` — 单 composition 脚手架（仅所选画幅）

无 `PACKY_API_KEY` 时写入明确标注的 mock JSON，不假装成高质量成片脚本。

## 渲染（render-worker）

Windows / 本机 NVIDIA（或服务器 GPU）上：

```bash
# 跳过真渲（CI / 无 GPU）：写占位 mp4 或标记 skipped
pnpm --filter render-worker start -- --job active-suspension-demo --skip-render

# 真渲（需已安装 Remotion，且 job 已 make 成功）
pnpm --filter render-worker start -- --job active-suspension-demo
```

官方意图命令（angle-egl）：

```bash
npx remotion render src/index.ts <CompositionId> out/final.mp4 --gl=angle-egl
```

见 `apps/render-worker/package.json` 的 `render:remotion` script。

输出：`.data/jobs/<id>/out/final.mp4`（或 `skipped.json`）。

## 端到端验收（第 1 刀）

1. `pnpm install`
2. `pnpm --filter make-worker start -- fixtures/active-suspension.job.json`
3. 确认 `.data/jobs/active-suspension-demo/status.json` 为 `ready_to_render`（mock QA 通过）或按 stub 规则回修
4. `pnpm --filter render-worker start -- --job active-suspension-demo --skip-render`
5. 本机有 GPU 且装好 Remotion 后再去掉 `--skip-render` 真出片

## 后续刀（范围外）

2. 业务 API + 队列 + 四屏建片路径  
3. 短信登录 + 真实扣费  
4. 套餐 + 微信/支付宝 + 落地页  
5. 压测再采购  

## License

私有，未开源。
