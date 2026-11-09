// おおよその費用を出すための単価（USD / 100 万トークン，標準・Global，入力 200K トークン以下）．
// 出典: https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing （2026-11-06 に確認）
// 単価は変わるので，費用メモを書くときはこの表の日付も一緒に書く．表にないモデルは費用を出さない．
import type { GenerateContentResponseUsageMetadata } from "@google/genai";

type Price = { input: number; audioInput: number; output: number; note?: string };

export const PRICES: Record<string, Price> = {
  "gemini-2.5-flash-lite": { input: 0.1, audioInput: 0.3, output: 0.4 },
  "gemini-2.5-flash": { input: 0.3, audioInput: 1.0, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, audioInput: 1.25, output: 10.0 },
  "gemini-3.1-flash-lite": { input: 0.25, audioInput: 0.5, output: 1.5 },
  "gemini-3.5-flash-lite": { input: 0.3, audioInput: 0.3, output: 2.5 },
  "gemini-3.5-flash": { input: 1.5, audioInput: 1.5, output: 9.0 },
  "gemini-3.8-flash": { input: 0.75, audioInput: 0.75, output: 3.75, note: "2026-12-31 までの導入価格．2027-01-01 から 1.5 / 7.5" },
};

export type Cost = { usd: number; breakdown: Record<string, { tokens: number; usd: number }>; note?: string } | null;

export function estimateCost(model: string, usage: GenerateContentResponseUsageMetadata | undefined): Cost {
  const price = PRICES[model.replace(/^.*\//, "")];
  if (!price || !usage) return null;
  const breakdown: Record<string, { tokens: number; usd: number }> = {};
  const add = (key: string, tokens: number, perM: number) => {
    breakdown[key] = { tokens, usd: (tokens / 1e6) * perM };
  };
  // 入力はモダリティ別（動画は映像 VIDEO と音声 AUDIO に分かれて数えられる）
  for (const d of usage.promptTokensDetails ?? []) {
    const m = String(d.modality ?? "UNKNOWN");
    add(`input_${m}`, d.tokenCount ?? 0, m === "AUDIO" ? price.audioInput : price.input);
  }
  // 出力は回答と思考（thinking）の合計に同じ単価がかかる
  add("output", usage.candidatesTokenCount ?? 0, price.output);
  add("thinking", usage.thoughtsTokenCount ?? 0, price.output);
  const usd = Object.values(breakdown).reduce((a, b) => a + b.usd, 0);
  return { usd, breakdown, note: price.note };
}
