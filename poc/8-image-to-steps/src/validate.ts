// 出力の確かめ:
//   1. 契約スキーマ（#6: shared/schema/thought-steps.schema.json）に通るか
//   2. スキーマでは表せない約束（範囲の大小・why が本当に引用か・what に評価語が無いか）
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { GeminiStep } from "./response-schema.ts";

export type ThoughtSteps = {
  schemaVersion: string;
  // transcript は契約では任意（PoC のスキーマでは必須だが，--contract-schema では無いことがある）
  steps: (Omit<GeminiStep, "transcript"> & { id: string; transcript?: string })[];
};

const DEFAULT_CONTRACT_PATH = fileURLToPath(
  new URL("../../../shared/schema/thought-steps.schema.json", import.meta.url),
);

export type ContractResult =
  | { status: "skipped"; reason: string }
  | { status: "checked"; path: string; schemaVersion: string; errors: string[] };

export function loadContractSchema(): { path: string; schema: any } | undefined {
  const path = process.env.CONTRACT_SCHEMA || DEFAULT_CONTRACT_PATH;
  if (!existsSync(path)) return undefined;
  return { path, schema: JSON.parse(readFileSync(path, "utf8")) };
}

export function loadContractVersion(): string | undefined {
  return loadContractSchema()?.schema?.properties?.schemaVersion?.const;
}

export function validateAgainstContract(doc: ThoughtSteps): ContractResult {
  const loaded = loadContractSchema();
  if (!loaded) {
    return {
      status: "skipped",
      reason: `契約スキーマが見つからない（${process.env.CONTRACT_SCHEMA || DEFAULT_CONTRACT_PATH}）`,
    };
  }
  const { path, schema } = loaded;
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  const errors: string[] = [];
  if (!validate(doc)) {
    for (const e of validate.errors ?? []) errors.push(`${e.instancePath || "/"} ${e.message}`);
  }
  return { status: "checked", path, schemaVersion: schema?.properties?.schemaVersion?.const, errors };
}

const EVALUATIVE = /正し|誤っ|誤り|間違|ミス|惜し|良い|悪い|不適切|適切に|うまく|正解/;

export function checkConventions(doc: ThoughtSteps, latexLines: string[] | undefined): string[] {
  const warnings: string[] = [];
  for (const step of doc.steps) {
    const src = step.source;
    if (src.kind === "image") {
      const [ymin, xmin, ymax, xmax] = src.box2d;
      if (ymin >= ymax || xmin >= xmax) {
        warnings.push(`${step.id}: box2d の大小が逆か面積 0 [${src.box2d.join(", ")}]`);
      }
    } else {
      if (src.lineStart > src.lineEnd) {
        warnings.push(`${step.id}: lineStart > lineEnd (${src.lineStart} > ${src.lineEnd})`);
      }
      const maxLine = Math.max(src.lineStart, src.lineEnd);
      if (latexLines && maxLine > latexLines.length) {
        warnings.push(`${step.id}: 行番号 (${maxLine}) が本文の行数 (${latexLines.length}) を超える`);
      }
    }

    const word = step.what.match(EVALUATIVE);
    if (word) warnings.push(`${step.id}: what に評価語らしきもの「${word[0]}」: ${step.what}`);

    if (step.why) {
      // 契約（shared/schema/README.md「守ること」）: post_quote の why.text は同じステップの transcript にそのまま含まれる
      // transcript は契約では任意（--contract-schema では無いことがある）
      if (!step.transcript?.includes(step.why.text)) {
        warnings.push(`${step.id}: why が同じステップの transcript に含まれない（契約違反．#14 では null に落ちる）: ${step.why.text}`);
      }
      // LaTeX は原文の該当行にも含まれるか（書き起こしごと言い換えていないか）
      if (latexLines && src.kind === "text") {
        const original = latexLines.slice(src.lineStart - 1, src.lineEnd).join("\n");
        if (!original.includes(step.why.text)) {
          warnings.push(`${step.id}: why が原文の該当行に見つからない（言い換えの疑い）: ${step.why.text}`);
        }
      }
    }
  }
  return warnings;
}
