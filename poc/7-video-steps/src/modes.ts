// Gemini に渡す responseJsonSchema と，返ってきた JSON を契約の形に直す処理．
//
// 2つのモードを比べる（shared/schema/README.md「Gemini の構造化出力に渡すとき」の確認）:
//   mmss     … 時刻を "MM:SS" の文字列で答えさせ，id・kind・by はコードで付ける
//   contract … 契約のスキーマをそのまま responseJsonSchema に渡し，返り値をそのまま使う（既定．時刻のずれが小さかったため）
import { readFileSync } from "node:fs";
import type { Step, ThoughtSteps } from "./contract.ts";

export type Mode = "mmss" | "contract";

const CONTRACT_SCHEMA_PATH = new URL("../../../shared/schema/thought-steps.schema.json", import.meta.url);

/** mmss モードで Gemini に返させる形．AI が書けるのは what・transcript・理由の引用だけ． */
export const MMSS_SCHEMA = {
  type: "object",
  required: ["steps"],
  additionalProperties: false,
  properties: {
    steps: {
      type: "array",
      minItems: 1,
      description: "思考ステップ．説明した順番に並べる．",
      items: {
        type: "object",
        required: ["start", "end", "transcript", "what", "whyQuote"],
        additionalProperties: false,
        properties: {
          start: { type: "string", description: "このステップを説明し始めた時刻．MM:SS（例 01:05）" },
          end: { type: "string", description: "このステップの説明が終わった時刻．MM:SS" },
          transcript: { type: "string", description: "この区間で話している言葉と，板書した式・文の書き起こし．言い換えない" },
          what: { type: "string", description: "何をしたかを短く整理したもの．正誤の評価は書かない" },
          whyQuote: {
            type: ["string", "null"],
            description: "このステップを選んだ理由を話者が自分で言っていれば，その部分を transcript からそのまま抜き出す．言っていなければ null．推測しない",
          },
        },
      },
    },
  },
} as const;

/** 契約のスキーマを読み込み，指定したキーを再帰的に取り除く（API が受け付けないキーがあったとき用）． */
export function loadContractSchema(stripKeys: string[]): unknown {
  const raw = JSON.parse(readFileSync(CONTRACT_SCHEMA_PATH, "utf8"));
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (typeof v !== "object" || v === null) return v;
    return Object.fromEntries(
      Object.entries(v).filter(([k]) => !stripKeys.includes(k)).map(([k, x]) => [k, strip(x)]),
    );
  };
  return strip(raw);
}

/** "MM:SS" / "M:SS" / "H:MM:SS"（秒は小数可）を秒に直す．読めなければ NaN． */
export function parseTimestamp(t: string): number {
  const m = t.trim().match(/^(?:(\d+):)?(\d{1,3}):(\d{1,2}(?:\.\d+)?)$/);
  if (!m) return Number.NaN;
  const [, h, mm, ss] = m;
  return (h ? Number(h) * 3600 : 0) + Number(mm) * 60 + Number(ss);
}


export type Converted = { result: ThoughtSteps; warnings: string[] };

/** Gemini の返り値を契約の形にし，原則に反する・怪しい箇所を warnings に残す． */
export function toContract(mode: Mode, raw: unknown): Converted {
  const warnings: string[] = [];
  let steps: Step[];

  if (mode === "mmss") {
    const r = raw as { steps: { start: string; end: string; transcript: string; what: string; whyQuote: string | null }[] };
    steps = r.steps.map((s, i) => {
      const startSec = parseTimestamp(s.start);
      const endSec = parseTimestamp(s.end);
      if (Number.isNaN(startSec) || Number.isNaN(endSec)) warnings.push(`s${i + 1}: 時刻を読めない start="${s.start}" end="${s.end}"`);
      return {
        id: `s${i + 1}`,
        what: s.what,
        why: s.whyQuote ? { text: s.whyQuote, by: "post_quote" as const } : null,
        transcript: s.transcript,
        source: { kind: "video" as const, startSec, endSec },
      };
    });
  } else {
    steps = (raw as ThoughtSteps).steps;
    for (const s of steps) {
      if (s.source?.kind !== "video") warnings.push(`${s.id}: 動画なのに source.kind が ${s.source?.kind}`);
      // AI が「本人がアプリで書いた」と名乗るのは原則違反なので落とす
      if (s.why?.by === "author") {
        warnings.push(`${s.id}: AI が why.by="author" を返したので null にした`);
        s.why = null;
      }
    }
  }

  for (const s of steps) {
    // why は引用だけ，という原則を機械的に確かめる（transcript 自体も AI の書き起こしなので完全な保証ではない）．
    // 契約（shared/schema/README.md）と src/contract.ts の検証に合わせ，句読点・空白も含めてそのままの文字列で比べる
    if (s.why && !(s.transcript && s.transcript.includes(s.why.text))) {
      warnings.push(`${s.id}: why が transcript の引用になっていないので null にした: "${s.why.text}"`);
      s.why = null;
    }
  }
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1].source, cur = steps[i].source;
    if (prev.kind === "video" && cur.kind === "video" && cur.startSec < prev.startSec)
      warnings.push(`${steps[i].id}: 開始時刻が前のステップより前`);
  }

  return { result: { schemaVersion: "0.1.0", steps }, warnings };
}
