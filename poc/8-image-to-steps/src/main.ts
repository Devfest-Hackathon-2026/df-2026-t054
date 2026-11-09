// PoC (#8): 手書き写真・LaTeX → Gemini の構造化出力 → 思考ステップの JSON
//
//   npm start -- <画像や .tex ...> [--out DIR] [--dry-run]
//
// 複数の画像は「1つの投稿の複数ページ」として順に imageIndex 0, 1, ... になる．
// .tex は1つまで．画像と一緒に渡してもよい．
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Part } from "@google/genai";
import { MODEL, createClient } from "./gemini.ts";
import { SYSTEM_INSTRUCTION, USER_INSTRUCTION } from "./prompt.ts";
import { renderPreview } from "./preview.ts";
import { buildResponseSchema, type GeminiResponse } from "./response-schema.ts";
import {
  checkConventions,
  loadContractSchema,
  loadContractVersion,
  validateAgainstContract,
  type ThoughtSteps,
} from "./validate.ts";

const IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};
const LATEX_EXT = new Set([".tex", ".txt"]);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", default: "out" },
    "dry-run": { type: "boolean", default: false },
    // 契約スキーマ（#6）をそのまま responseJsonSchema に渡す実験．id・schemaVersion も Gemini に書かせる
    "contract-schema": { type: "boolean", default: false },
  },
});

if (positionals.length === 0) {
  console.error("使い方: npm start -- <画像や .tex ...> [--out DIR] [--dry-run] [--contract-schema]");
  process.exit(1);
}

// ---- 入力を分ける ----
const images: { path: string; mimeType: string }[] = [];
let latex: { path: string; lines: string[] } | undefined;
for (const p of positionals) {
  const path = resolve(p);
  const ext = extname(path).toLowerCase();
  if (IMAGE_MIME[ext]) {
    images.push({ path, mimeType: IMAGE_MIME[ext] });
  } else if (LATEX_EXT.has(ext)) {
    if (latex) throw new Error("LaTeX は1ファイルまで");
    // 契約・#14（server/src/steps.ts の splitLines）と同じ数え方: 改行で分ける．CRLF も改行1つ
    latex = { path, lines: readFileSync(path, "utf8").split(/\r?\n/) };
  } else {
    throw new Error(`対応していない拡張子: ${p}`);
  }
}

// ---- リクエストを組み立てる ----
const parts: Part[] = [];
images.forEach((img, i) => {
  parts.push({ text: `画像 ${i}（imageIndex: ${i}）:` });
  parts.push({ inlineData: { mimeType: img.mimeType, data: readFileSync(img.path).toString("base64") } });
});
if (latex) {
  // 行番号を付けて渡し，source に行の範囲で答えさせる
  const numbered = latex.lines.map((line, i) => `${i + 1}: ${line}`).join("\n");
  parts.push({ text: `LaTeX（各行の先頭は行番号）:\n${numbered}` });
}
parts.push({ text: USER_INSTRUCTION });

const contractSchema = values["contract-schema"] ? loadContractSchema() : undefined;
if (values["contract-schema"] && !contractSchema) throw new Error("契約スキーマが見つからない（CONTRACT_SCHEMA を指定する）");
const responseJsonSchema =
  contractSchema?.schema ??
  buildResponseSchema({ imageCount: images.length, latexLineCount: latex?.lines.length ?? 0 });

const config = {
  systemInstruction: SYSTEM_INSTRUCTION,
  responseMimeType: "application/json",
  responseJsonSchema,
  temperature: 0,
};

if (values["dry-run"]) {
  console.log(JSON.stringify({ model: MODEL, config, parts: parts.map(summarizePart) }, null, 2));
  process.exit(0);
}

// ---- 呼び出す ----
const { ai, backend } = createClient();
console.error(`backend: ${backend} / model: ${MODEL} / 画像 ${images.length} 枚 / LaTeX ${latex ? latex.lines.length + " 行" : "なし"}`);

const started = performance.now();
const response = await ai.models.generateContent({
  model: MODEL,
  contents: [{ role: "user", parts }],
  config,
});
const elapsedMs = Math.round(performance.now() - started);

const text = response.text;
if (!text) throw new Error(`空の応答: ${JSON.stringify(response.candidates?.[0]?.finishReason)}`);
const parsed = JSON.parse(text) as GeminiResponse;

// 通常は id と schemaVersion をコード側で付ける．--contract-schema では Gemini の出力をそのまま使う
const doc: ThoughtSteps = contractSchema
  ? (parsed as ThoughtSteps)
  : {
      schemaVersion: loadContractVersion() ?? "0.1.0",
      steps: parsed.steps.map((s, i) => ({ id: `s${i + 1}`, ...s })),
    };

// ---- 確かめる ----
const contract = validateAgainstContract(doc);
const warnings = checkConventions(doc, latex?.lines);

// ---- 書き出す ----
const outDir = resolve(values.out!, new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "steps.json"), JSON.stringify(doc, null, 2) + "\n");
writeFileSync(
  join(outDir, "run.json"),
  JSON.stringify(
    {
      backend,
      model: MODEL,
      responseSchema: contractSchema ? `contract (${contractSchema.path})` : "poc (src/response-schema.ts)",
      elapsedMs,
      usage: response.usageMetadata,
      inputs: positionals,
      contract,
      warnings,
      rawText: text,
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  join(outDir, "preview.html"),
  renderPreview(
    doc,
    images.map((img) => ({ src: relative(outDir, img.path), name: basename(img.path) })),
    latex?.lines,
  ),
);

// ---- まとめを表示する ----
const u = response.usageMetadata;
console.error(`処理時間: ${elapsedMs} ms / トークン: 入力 ${u?.promptTokenCount} ・出力 ${u?.candidatesTokenCount} ・思考 ${u?.thoughtsTokenCount ?? 0}`);
console.error(`ステップ数: ${doc.steps.length}（why あり ${doc.steps.filter((s) => s.why).length}）`);
if (contract.status === "skipped") {
  console.error(`契約スキーマ: 検証を省略 — ${contract.reason}`);
} else {
  console.error(
    `契約スキーマ (${contract.schemaVersion}): ${contract.errors.length === 0 ? "OK" : `NG ${contract.errors.length} 件`}`,
  );
  for (const e of contract.errors) console.error(`  - ${e}`);
}
console.error(`約束のチェック: ${warnings.length === 0 ? "OK" : `${warnings.length} 件`}`);
for (const w of warnings) console.error(`  - ${w}`);
console.error(`出力: ${outDir}/{steps.json, run.json, preview.html}`);
console.log(JSON.stringify(doc, null, 2));

function summarizePart(p: Part) {
  return p.inlineData ? { inlineData: { mimeType: p.inlineData.mimeType, bytes: p.inlineData.data?.length } } : p;
}
