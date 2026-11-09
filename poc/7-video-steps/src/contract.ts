// 思考ステップの契約（shared/schema/thought-steps.schema.json）の型と，最小限の検証．
// 検証ライブラリ（ajv など）を足さないため，スキーマの制約を手で書いている．
// スキーマが変わったらここも合わせる（PoC 用．本番では #14 で検証方法を決め直す）．

export type Why = { text: string; by: "post_quote" | "author" };
export type VideoSource = { kind: "video"; startSec: number; endSec: number };
export type ImageSource = { kind: "image"; imageIndex: number; box2d: [number, number, number, number] };
export type TextSource = { kind: "text"; lineStart: number; lineEnd: number };
export type Step = {
  id: string;
  what: string;
  why: Why | null;
  transcript?: string;
  source: VideoSource | ImageSource | TextSource;
};
export type ThoughtSteps = { schemaVersion: "0.1.0"; steps: Step[] };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function onlyKeys(o: Record<string, unknown>, allowed: string[], path: string, errors: string[]) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) errors.push(`${path}: 余計なキー "${k}"`);
}

/** 契約に合っていれば空配列．合っていなければ理由の一覧を返す． */
export function validateThoughtSteps(data: unknown): string[] {
  const e: string[] = [];
  if (!isObj(data)) return ["ルートがオブジェクトでない"];
  onlyKeys(data, ["schemaVersion", "steps"], "$", e);
  if (data.schemaVersion !== "0.1.0") e.push(`$.schemaVersion が "0.1.0" でない: ${JSON.stringify(data.schemaVersion)}`);
  if (!Array.isArray(data.steps) || data.steps.length === 0) {
    e.push("$.steps が1つ以上の配列でない");
    return e;
  }
  const ids = new Set<string>();
  data.steps.forEach((s: unknown, i: number) => {
    const p = `$.steps[${i}]`;
    if (!isObj(s)) return void e.push(`${p}: オブジェクトでない`);
    onlyKeys(s, ["id", "what", "why", "transcript", "source"], p, e);
    for (const k of ["id", "what", "why", "source"]) if (!(k in s)) e.push(`${p}: 必須の "${k}" がない`);
    if (typeof s.id !== "string" || !/^s[0-9]+$/.test(s.id)) e.push(`${p}.id が ^s[0-9]+$ でない`);
    else if (ids.has(s.id)) e.push(`${p}.id "${s.id}" が重複`);
    else ids.add(s.id);
    if (typeof s.what !== "string" || s.what.length === 0) e.push(`${p}.what が空でない文字列でない`);
    if ("transcript" in s && typeof s.transcript !== "string") e.push(`${p}.transcript が文字列でない`);
    if (s.why !== null && "why" in s) {
      if (!isObj(s.why)) e.push(`${p}.why が null でもオブジェクトでもない`);
      else {
        onlyKeys(s.why, ["text", "by"], `${p}.why`, e);
        if (typeof s.why.text !== "string" || s.why.text.length === 0) e.push(`${p}.why.text が空でない文字列でない`);
        if (s.why.by !== "post_quote" && s.why.by !== "author") e.push(`${p}.why.by が post_quote / author でない`);
        // スキーマでは表せない制約: post_quote は transcript にそのまま含まれる引用だけ
        if (s.why.by === "post_quote" && (typeof s.transcript !== "string" || typeof s.why.text !== "string" || !s.transcript.includes(s.why.text)))
          e.push(`${p}.why: post_quote なのに transcript に why.text がそのまま含まれていない`);
      }
    }
    const src = s.source;
    if (!isObj(src)) return void e.push(`${p}.source がオブジェクトでない`);
    if (src.kind === "video") {
      onlyKeys(src, ["kind", "startSec", "endSec"], `${p}.source`, e);
      const { startSec, endSec } = src;
      if (!Number.isFinite(startSec) || (startSec as number) < 0) e.push(`${p}.source.startSec が 0 以上の数でない`);
      if (!Number.isFinite(endSec) || (endSec as number) < 0) e.push(`${p}.source.endSec が 0 以上の数でない`);
      // スキーマでは表せない制約（README「使う側で確かめる」）
      if (typeof startSec === "number" && typeof endSec === "number" && endSec < startSec)
        e.push(`${p}.source: endSec (${endSec}) < startSec (${startSec})`);
    } else if (src.kind === "image") {
      onlyKeys(src, ["kind", "imageIndex", "box2d"], `${p}.source`, e);
      if (!Number.isInteger(src.imageIndex) || (src.imageIndex as number) < 0) e.push(`${p}.source.imageIndex が 0 以上の整数でない`);
      const b = src.box2d;
      if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => Number.isInteger(n) && n >= 0 && n <= 1000))
        e.push(`${p}.source.box2d が 0〜1000 の整数4つでない`);
      else if (b[0] > b[2] || b[1] > b[3]) e.push(`${p}.source.box2d: ymin ≤ ymax，xmin ≤ xmax でない`);
    } else if (src.kind === "text") {
      onlyKeys(src, ["kind", "lineStart", "lineEnd"], `${p}.source`, e);
      const { lineStart, lineEnd } = src;
      if (!Number.isInteger(lineStart) || (lineStart as number) < 1) e.push(`${p}.source.lineStart が 1 以上の整数でない`);
      if (!Number.isInteger(lineEnd) || (lineEnd as number) < 1) e.push(`${p}.source.lineEnd が 1 以上の整数でない`);
      // 本文の行数以下かは，本文を持っている側（#8・#14）で確かめる
      if (typeof lineStart === "number" && typeof lineEnd === "number" && lineEnd < lineStart)
        e.push(`${p}.source: lineEnd (${lineEnd}) < lineStart (${lineStart})`);
    } else e.push(`${p}.source.kind が video / image / text でない`);
  });
  return e;
}
