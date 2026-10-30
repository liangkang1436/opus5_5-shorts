/**
 * PackyAPI hook for Opus 5.5 effort=extra.
 * Without PACKY_API_KEY → clear mock stub (not fake high-quality Opus).
 */

export interface OpusScriptResult {
  isMock: boolean;
  model: string;
  acts: Array<{
    id: string;
    title: string;
    narration: string;
    durationHintSec: number;
  }>;
  cues: Array<{ atSec: number; label: string; note: string }>;
  raw?: unknown;
}

const MOCK_MODEL = "mock-stub (no PACKY_API_KEY)";

export function buildMockScript(feed: string): OpusScriptResult {
  const snippet = feed.trim().slice(0, 80);
  return {
    isMock: true,
    model: MOCK_MODEL,
    acts: [
      {
        id: "act-1",
        title: "问题引入",
        narration: `【MOCK】开场点题。投料摘要：${snippet}…`,
        durationHintSec: 8,
      },
      {
        id: "act-2",
        title: "闭环拆解",
        narration:
          "【MOCK】传感器 → ECU → 作动器。本段为占位旁白，接 PackyAPI 后由 Opus 5.5 effort=extra 重写。",
        durationHintSec: 20,
      },
      {
        id: "act-3",
        title: "方案对比与收束",
        narration: "【MOCK】两类主流方案差异 + 一句收束。非真实 Opus 质量。",
        durationHintSec: 12,
      },
    ],
    cues: [
      { atSec: 0, label: "title_card", note: "mock cue" },
      { atSec: 8, label: "loop_diagram", note: "mock cue" },
      { atSec: 28, label: "compare", note: "mock cue" },
    ],
  };
}

export async function callOpusExtra(feed: string): Promise<OpusScriptResult> {
  const apiKey = process.env.PACKY_API_KEY?.trim();
  if (!apiKey) {
    return buildMockScript(feed);
  }

  const baseUrl = (
    process.env.PACKY_BASE_URL?.trim() || "https://api.packyapi.example/v1"
  ).replace(/\/$/, "");
  const model = process.env.PACKY_MODEL?.trim() || "claude-opus-5.5";

  const system = [
    "你是硬核科普短视频编剧。输出严格 JSON，字段：acts[{id,title,narration,durationHintSec}], cues[{atSec,label,note}]。",
    "风格：中性灰摄影棚、工程几何、克制功能色；旁白中文，短句可上屏。",
    "effort=extra：结构完整、事实可核、不要空话。",
  ].join("\n");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      // Packy / Anthropic-style effort hint when supported by gateway
      extra_body: { effort: "extra" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: feed },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PackyAPI ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("PackyAPI returned empty content");
  }

  let parsed: { acts?: OpusScriptResult["acts"]; cues?: OpusScriptResult["cues"] };
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    throw new Error("PackyAPI content is not valid JSON");
  }

  if (!Array.isArray(parsed.acts) || parsed.acts.length === 0) {
    throw new Error("PackyAPI JSON missing acts[]");
  }

  return {
    isMock: false,
    model,
    acts: parsed.acts,
    cues: Array.isArray(parsed.cues) ? parsed.cues : [],
    raw: data,
  };
}
