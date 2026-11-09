// PoC #7: 説明動画 → 思考ステップ＋時刻
//   1. ローカルの動画を Cloud Storage に上げる（gs:// を渡したら上げない）
//   2. Vertex AI の Gemini に gs:// の URI と responseJsonSchema を渡して構造化出力させる
//   3. 契約（shared/schema/thought-steps.schema.json）の形に直して検証し，処理時間・トークン・費用と一緒に保存する
//
// 使い方は README.md を参照．
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { GoogleGenAI, MediaResolution } from "@google/genai";
import { validateThoughtSteps } from "./contract.ts";
import { estimateCost } from "./pricing.ts";
import { MMSS_SCHEMA, type Mode, loadContractSchema, toContract } from "./modes.ts";

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    mode: { type: "string", default: "contract" },
    model: { type: "string", default: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite" },
    fps: { type: "string" },
    "media-resolution": { type: "string" },
    "thinking-budget": { type: "string" },
    "strip-keys": { type: "string", default: "" },
    truth: { type: "string" },
    out: { type: "string", default: "out" },
  },
});

const input = positionals[0];
if (!input) {
  console.error("使い方: npm start -- <動画ファイル | gs://...> [--mode contract|mmss] [--model ...] [--truth samples/xxx.truth.json]");
  process.exit(1);
}
const mode = opt.mode as Mode;
if (mode !== "mmss" && mode !== "contract") throw new Error(`--mode は mmss か contract: ${mode}`);

const project = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION ?? "global";
const bucket = process.env.POC_GCS_BUCKET;
if (!project) throw new Error(".env に GOOGLE_CLOUD_PROJECT を書く（.env.example を参照）");

const MIME: Record<string, string> = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mpeg": "video/mpeg" };

const PROMPT = `あなたは学習プラットフォームの「整理役」です．添付の動画は，学生が問題の解き方を説明している動画です．
説明を「思考ステップ」の列に分けてください．

守ること:
- ステップは説明した順に並べる．挨拶・締めの言葉など，解き方と関係ない部分はステップにしない
- start / end は，そのステップを話し始めた時刻と話し終えた時刻（動画の先頭からの経過時間）．ステップ同士はなるべく隙間なく続ける
- transcript は，その区間で話している言葉と板書した式・文の書き起こし．言い換えたり要約したりしない
- what は「何をしたか」を短く整理する．正しい・誤っている・うまい，などの評価は書かない
- 理由（なぜそうしたか）は，話者が自分の言葉で言っているときだけ，その部分を transcript からそのまま抜き出す．言っていなければ null にする．あなたが理由を推測・補足して書いてはいけない
- 解き方が正しいかどうかは判断しない`;

const t0 = performance.now();

// 1. Cloud Storage へ
let gcsUri: string;
let uploadMs = 0;
let sizeBytes: number | null = null;
if (input.startsWith("gs://")) {
  gcsUri = input;
} else {
  if (!bucket) throw new Error(".env に POC_GCS_BUCKET を書く（ローカルの動画を上げる先）");
  sizeBytes = statSync(input).size;
  gcsUri = `gs://${bucket}/poc-7/${basename(input)}`;
  const u0 = performance.now();
  await promisify(execFile)("gcloud", ["storage", "cp", input, gcsUri]);
  uploadMs = performance.now() - u0;
  console.log(`アップロード: ${gcsUri}（${(sizeBytes / 1e6).toFixed(1)} MB, ${(uploadMs / 1000).toFixed(1)} 秒）`);
}
const mimeType = MIME[extname(gcsUri).toLowerCase()] ?? "video/mp4";

// 2. Gemini（Vertex AI）
const ai = new GoogleGenAI({ vertexai: true, project, location });
const responseJsonSchema = mode === "mmss" ? MMSS_SCHEMA : loadContractSchema(opt["strip-keys"].split(",").filter(Boolean));
const mediaResolution = opt["media-resolution"]
  ? (MediaResolution as Record<string, MediaResolution>)[`MEDIA_RESOLUTION_${opt["media-resolution"].toUpperCase()}`]
  : undefined;

const g0 = performance.now();
const res = await ai.models.generateContent({
  model: opt.model,
  contents: [
    {
      role: "user",
      parts: [
        { fileData: { fileUri: gcsUri, mimeType }, ...(opt.fps ? { videoMetadata: { fps: Number(opt.fps) } } : {}) },
        { text: PROMPT },
      ],
    },
  ],
  config: {
    responseMimeType: "application/json",
    responseJsonSchema,
    temperature: 0,
    ...(mediaResolution ? { mediaResolution } : {}),
    ...(opt["thinking-budget"] ? { thinkingConfig: { thinkingBudget: Number(opt["thinking-budget"]) } } : {}),
  },
});
const generateMs = performance.now() - g0;
const totalMs = performance.now() - t0;

// 3. 契約の形に直して検証
const text = res.text ?? "";
let raw: unknown;
try {
  raw = JSON.parse(text);
} catch {
  console.error("JSON として読めなかった:\n" + text);
  process.exit(1);
}
const { result, warnings } = toContract(mode, raw);
const errors = validateThoughtSteps(result);
const cost = estimateCost(opt.model, res.usageMetadata);

// 正解（合成動画を作ったときの区間）があれば，開始時刻のずれを測る
let timing: unknown = undefined;
if (opt.truth) {
  const truth = JSON.parse(readFileSync(opt.truth, "utf8")) as {
    totalSec: number;
    steps: { id: string; startSec: number; endSec: number; label: string }[];
  };
  // 動画の長さを超える時刻は契約の検証では弾けない（長さを知らない）ので，ここで警告する
  for (const s of result.steps)
    if (s.source.kind === "video" && s.source.endSec > truth.totalSec + 1)
      warnings.push(`${s.id}: endSec (${s.source.endSec}) が動画の長さ (${truth.totalSec}) を超えている`);
  const starts = result.steps.map((s) => (s.source.kind === "video" ? s.source.startSec : Number.NaN));
  const rows = truth.steps.map((t) => {
    const diffs = starts.map((s) => s - t.startSec);
    const best = diffs.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a), Number.POSITIVE_INFINITY);
    return { truth: t.id, label: t.label, truthStartSec: t.startSec, nearestDiffSec: Number(best.toFixed(2)) };
  });
  const meanAbs = rows.reduce((a, r) => a + Math.abs(r.nearestDiffSec), 0) / rows.length;
  timing = { truthSteps: truth.steps.length, predictedSteps: result.steps.length, meanAbsStartDiffSec: Number(meanAbs.toFixed(2)), rows };
}

const meta = {
  input,
  gcsUri,
  sizeBytes,
  model: opt.model,
  location,
  mode,
  fps: opt.fps ? Number(opt.fps) : "default(1)",
  mediaResolution: opt["media-resolution"] ?? "default",
  thinkingBudget: opt["thinking-budget"] ?? "default",
  ms: { upload: Math.round(uploadMs), generate: Math.round(generateMs), total: Math.round(totalMs) },
  usage: res.usageMetadata,
  costUsd: cost,
  validationErrors: errors,
  warnings,
  timing,
  modelVersion: res.modelVersion,
  createdAt: new Date().toISOString(),
};

mkdirSync(opt.out, { recursive: true });
const stem = `${basename(gcsUri, extname(gcsUri))}.${opt.model.replace(/[^\w.-]/g, "_")}.${mode}.${Date.now()}`;
writeFileSync(join(opt.out, `${stem}.steps.json`), JSON.stringify(result, null, 2) + "\n");
writeFileSync(join(opt.out, `${stem}.meta.json`), JSON.stringify({ meta, raw }, null, 2) + "\n");

// 結果の要約
console.log(`\nモデル ${opt.model} / モード ${mode} / 生成 ${(generateMs / 1000).toFixed(1)} 秒 / 合計 ${(totalMs / 1000).toFixed(1)} 秒`);
console.log(`トークン 入力 ${res.usageMetadata?.promptTokenCount} / 出力 ${res.usageMetadata?.candidatesTokenCount} / 思考 ${res.usageMetadata?.thoughtsTokenCount ?? 0}`);
console.log(`費用の目安 ${cost ? `$${cost.usd.toFixed(5)}（約 ${(cost.usd * 155).toFixed(2)} 円，1 USD = 155 円で換算）` : "（単価表にないモデル）"}`);
for (const s of result.steps) {
  const src = s.source.kind === "video" ? `${s.source.startSec}–${s.source.endSec}s` : "";
  console.log(`  ${s.id} [${src}] ${s.what}${s.why ? `\n      why(引用): ${s.why.text}` : ""}`);
}
if (timing) console.log("時刻のずれ:", JSON.stringify(timing, null, 2));
if (warnings.length) console.log("警告:\n  " + warnings.join("\n  "));
console.log(errors.length ? `契約違反:\n  ${errors.join("\n  ")}` : "契約（thought-steps.schema.json）に合っている");
console.log(`保存: ${join(opt.out, stem)}.{steps,meta}.json`);
process.exit(errors.length ? 2 : 0);
