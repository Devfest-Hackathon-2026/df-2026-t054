// 思考ステップの契約（shared/schema/thought-steps.schema.json）の型と検証．
// PoC #7（PR #34 の poc/7-video-steps/src/contract.ts．11/6 に書いたもの）から移した．検証ライブラリは足さず，スキーマの制約を手で書いている．
// スキーマが変わったらここも合わせる
import { readFileSync } from 'node:fs'

export type PostKind = 'image' | 'text' | 'video'
export type Why = { text: string; by: 'post_quote' | 'author' }
export type VideoSource = { kind: 'video'; startSec: number; endSec: number }
export type ImageSource = { kind: 'image'; imageIndex: number; box2d: [number, number, number, number] }
export type TextSource = { kind: 'text'; lineStart: number; lineEnd: number }
export type Step = {
  id: string
  what: string
  why: Why | null
  transcript?: string
  source: VideoSource | ImageSource | TextSource
}
export type ThoughtSteps = { schemaVersion: '0.1.0'; steps: Step[] }

// npm run build で lib/ に写したスキーマ（scripts/copy-schema.js）
const schemaUrl = new URL('./thought-steps.schema.json', import.meta.url)

/** Gemini の responseJsonSchema に渡すスキーマ（中身は geminiSchema） */
export function schemaFor(kind: PostKind): unknown {
  return geminiSchema(JSON.parse(readFileSync(schemaUrl, 'utf8')), kind)
}

const POST_KINDS: PostKind[] = ['image', 'text', 'video']

/**
 * 契約のスキーマから，Gemini に渡すスキーマを作る（契約の部分集合．引数は書き換えない）．
 * - source を投稿の種類のものだけに絞り，ほかの種類の定義（$defs の xxxSource）は消す
 * - Gemini は const を守らない（画像の投稿で source.kind に "text" や "box" を返し，全ステップが捨てられた．#64）ので，
 *   同じ意味の enum（値1つ）に置き換える．enum なら守る
 */
export function geminiSchema(contract: unknown, kind: PostKind): unknown {
  const schema = structuredClone(contract) as { $defs: Record<string, { properties?: Record<string, object> }> }
  const step = schema.$defs.step
  step.properties!.source = { ...step.properties!.source, anyOf: [{ $ref: `#/$defs/${kind}Source` }] }
  for (const k of POST_KINDS) if (k !== kind) delete schema.$defs[`${k}Source`]
  return constToEnum(schema)
}

// 値が「名前 → スキーマ」の対応になるキーワード．この直下のキーは名前なので，const という名前でもキーワードとして扱わない
const NAMED_SCHEMAS = new Set(['properties', '$defs', 'definitions', 'patternProperties'])
// 値がスキーマではなくデータのキーワード．中を辿らない
const DATA_VALUES = new Set(['enum', 'default', 'examples', 'required'])

/** スキーマ中のキーワードの const を enum（値1つ）に置き換える */
function constToEnum(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(constToEnum)
  if (!isObj(v)) return v
  const out: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(v)) {
    if (k === 'const') out.enum = [x]
    else if (DATA_VALUES.has(k)) out[k] = x
    else if (NAMED_SCHEMAS.has(k) && isObj(x))
      out[k] = Object.fromEntries(Object.entries(x).map(([name, s]) => [name, constToEnum(s)]))
    else out[k] = constToEnum(x)
  }
  return out
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function onlyKeys(o: Record<string, unknown>, allowed: string[], path: string, errors: string[]) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) errors.push(`${path}: 余計なキー "${k}"`)
}

/** 契約に合っていれば空配列．合っていなければ理由の一覧を返す */
export function validateThoughtSteps(data: unknown): string[] {
  const e: string[] = []
  if (!isObj(data)) return ['ルートがオブジェクトでない']
  onlyKeys(data, ['schemaVersion', 'steps'], '$', e)
  if (data.schemaVersion !== '0.1.0') e.push(`$.schemaVersion が "0.1.0" でない: ${JSON.stringify(data.schemaVersion)}`)
  if (!Array.isArray(data.steps) || data.steps.length === 0) {
    e.push('$.steps が1つ以上の配列でない')
    return e
  }
  const ids = new Set<string>()
  data.steps.forEach((s: unknown, i: number) => {
    const p = `$.steps[${i}]`
    if (!isObj(s)) return void e.push(`${p}: オブジェクトでない`)
    onlyKeys(s, ['id', 'what', 'why', 'transcript', 'source'], p, e)
    for (const k of ['id', 'what', 'why', 'source']) if (!(k in s)) e.push(`${p}: 必須の "${k}" がない`)
    if (typeof s.id !== 'string' || !/^s[0-9]+$/.test(s.id)) e.push(`${p}.id が ^s[0-9]+$ でない`)
    else if (ids.has(s.id)) e.push(`${p}.id "${s.id}" が重複`)
    else ids.add(s.id)
    if (typeof s.what !== 'string' || s.what.length === 0) e.push(`${p}.what が空でない文字列でない`)
    if ('transcript' in s && typeof s.transcript !== 'string') e.push(`${p}.transcript が文字列でない`)
    if (s.why !== null && 'why' in s) {
      if (!isObj(s.why)) e.push(`${p}.why が null でもオブジェクトでもない`)
      else {
        onlyKeys(s.why, ['text', 'by'], `${p}.why`, e)
        if (typeof s.why.text !== 'string' || s.why.text.length === 0) e.push(`${p}.why.text が空でない文字列でない`)
        if (s.why.by !== 'post_quote' && s.why.by !== 'author') e.push(`${p}.why.by が post_quote / author でない`)
        // スキーマでは表せない制約: post_quote は transcript にそのまま含まれる引用だけ
        if (
          s.why.by === 'post_quote' &&
          (typeof s.transcript !== 'string' || typeof s.why.text !== 'string' || !s.transcript.includes(s.why.text))
        )
          e.push(`${p}.why: post_quote なのに transcript に why.text がそのまま含まれていない`)
      }
    }
    const src = s.source
    if (!isObj(src)) return void e.push(`${p}.source がオブジェクトでない`)
    if (src.kind === 'video') {
      onlyKeys(src, ['kind', 'startSec', 'endSec'], `${p}.source`, e)
      const { startSec, endSec } = src
      if (!Number.isFinite(startSec) || (startSec as number) < 0) e.push(`${p}.source.startSec が 0 以上の数でない`)
      if (!Number.isFinite(endSec) || (endSec as number) < 0) e.push(`${p}.source.endSec が 0 以上の数でない`)
      if (typeof startSec === 'number' && typeof endSec === 'number' && endSec < startSec)
        e.push(`${p}.source: endSec (${endSec}) < startSec (${startSec})`)
    } else if (src.kind === 'image') {
      onlyKeys(src, ['kind', 'imageIndex', 'box2d'], `${p}.source`, e)
      if (!Number.isInteger(src.imageIndex) || (src.imageIndex as number) < 0)
        e.push(`${p}.source.imageIndex が 0 以上の整数でない`)
      const b = src.box2d
      if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => Number.isInteger(n) && n >= 0 && n <= 1000))
        e.push(`${p}.source.box2d が 0〜1000 の整数4つでない`)
      else if (b[0] > b[2] || b[1] > b[3]) e.push(`${p}.source.box2d: ymin ≤ ymax，xmin ≤ xmax でない`)
    } else if (src.kind === 'text') {
      onlyKeys(src, ['kind', 'lineStart', 'lineEnd'], `${p}.source`, e)
      const { lineStart, lineEnd } = src
      if (!Number.isInteger(lineStart) || (lineStart as number) < 1) e.push(`${p}.source.lineStart が 1 以上の整数でない`)
      if (!Number.isInteger(lineEnd) || (lineEnd as number) < 1) e.push(`${p}.source.lineEnd が 1 以上の整数でない`)
      if (typeof lineStart === 'number' && typeof lineEnd === 'number' && lineEnd < lineStart)
        e.push(`${p}.source: lineEnd (${lineEnd}) < lineStart (${lineStart})`)
    } else e.push(`${p}.source.kind が video / image / text でない`)
  })
  return e
}

// ---- 2つの投稿の対応関係（shared/schema/step-alignment.schema.json）----

export type Segment = { type: 'same' | 'split'; a: string[]; b: string[] }
export type StepAlignment = { schemaVersion: '0.1.0'; segments: Segment[] }

/**
 * 対応関係が契約と「使う側で確かめる決まり」（shared/schema/README.md）に合っていれば空配列．
 * aIds・bIds はそれぞれの投稿のステップの id（順番どおり）
 */
export function validateStepAlignment(data: unknown, aIds: string[], bIds: string[]): string[] {
  const e: string[] = []
  if (!isObj(data)) return ['ルートがオブジェクトでない']
  onlyKeys(data, ['schemaVersion', 'segments'], '$', e)
  if (data.schemaVersion !== '0.1.0') e.push(`$.schemaVersion が "0.1.0" でない: ${JSON.stringify(data.schemaVersion)}`)
  if (!Array.isArray(data.segments) || data.segments.length === 0) {
    e.push('$.segments が1つ以上の配列でない')
    return e
  }
  const seen = { a: [] as unknown[], b: [] as unknown[] }
  let prevType: unknown
  data.segments.forEach((seg: unknown, i: number) => {
    const p = `$.segments[${i}]`
    if (!isObj(seg)) return void e.push(`${p}: オブジェクトでない`)
    onlyKeys(seg, ['type', 'a', 'b'], p, e)
    if (seg.type !== 'same' && seg.type !== 'split') e.push(`${p}.type が same / split でない`)
    for (const side of ['a', 'b'] as const) {
      const ids = seg[side]
      if (!Array.isArray(ids)) e.push(`${p}.${side} が配列でない`)
      else seen[side].push(...ids)
    }
    const na = Array.isArray(seg.a) ? seg.a.length : 0
    const nb = Array.isArray(seg.b) ? seg.b.length : 0
    if (seg.type === 'same' && (na === 0 || nb === 0)) e.push(`${p}: same なのに a か b が空`)
    if (seg.type === 'split' && na === 0 && nb === 0) e.push(`${p}: split なのに a も b も空`)
    if (seg.type === 'split' && prevType === 'split') e.push(`${p}: split が続いている`)
    prevType = seg.type
  })
  const same = (x: unknown[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i])
  if (!same(seen.a, aIds)) e.push(`$.segments の a をつないだ ${JSON.stringify(seen.a)} が投稿のステップ ${JSON.stringify(aIds)} と一致しない`)
  if (!same(seen.b, bIds)) e.push(`$.segments の b をつないだ ${JSON.stringify(seen.b)} が投稿のステップ ${JSON.stringify(bIds)} と一致しない`)
  return e
}

// ---- AI の問いかけ（shared/schema/step-questions.schema.json）----

export type QuestionKind = 'branch' | 'missing_why'
export type Question = { side: 'a' | 'b'; stepId: string; kind: QuestionKind; text: string; by: 'ai' | 'template' }
export type StepQuestions = { schemaVersion: '0.1.0'; questions: Question[] }

/** 問いの文の決まり（README の「問いかけで使う側が確かめる決まり」）を満たさなければ理由を返す */
export function questionTextProblem(text: unknown): string | undefined {
  if (typeof text !== 'string' || text.trim().length === 0) return '空でない文字列でない'
  if (text.length > 120) return `120字を超える (${text.length}字)`
  if (/[\r\n]/.test(text)) return '改行を含む'
  if (!/[？?]$/.test(text)) return '「？」で終わらない'
  return undefined
}

/**
 * 問いかけが契約に合っていれば空配列．aIds・bIds はそれぞれの投稿のステップの id（順番どおり）．
 * 1つのステップに問いは1つまで．並びは a の順，次に b の順
 */
export function validateStepQuestions(data: unknown, aIds: string[], bIds: string[]): string[] {
  const e: string[] = []
  if (!isObj(data)) return ['ルートがオブジェクトでない']
  onlyKeys(data, ['schemaVersion', 'questions'], '$', e)
  if (data.schemaVersion !== '0.1.0') e.push(`$.schemaVersion が "0.1.0" でない: ${JSON.stringify(data.schemaVersion)}`)
  if (!Array.isArray(data.questions)) return [...e, '$.questions が配列でない']
  let prev = -1
  data.questions.forEach((q: unknown, i: number) => {
    const p = `$.questions[${i}]`
    if (!isObj(q)) return void e.push(`${p}: オブジェクトでない`)
    onlyKeys(q, ['side', 'stepId', 'kind', 'text', 'by'], p, e)
    if (q.side !== 'a' && q.side !== 'b') return void e.push(`${p}.side が a / b でない`)
    const ids = q.side === 'a' ? aIds : bIds
    const pos = ids.indexOf(q.stepId as string)
    if (pos < 0) e.push(`${p}.stepId ${JSON.stringify(q.stepId)} が ${q.side} のステップに無い`)
    else {
      const order = (q.side === 'a' ? 0 : aIds.length) + pos
      if (order <= prev) e.push(`${p}: 並び（a の順，次に b の順）が崩れているか，同じステップに2つある`)
      prev = order
    }
    if (q.kind !== 'branch' && q.kind !== 'missing_why') e.push(`${p}.kind が branch / missing_why でない`)
    if (q.by !== 'ai' && q.by !== 'template') e.push(`${p}.by が ai / template でない`)
    const problem = questionTextProblem(q.text)
    if (problem) e.push(`${p}.text が${problem}`)
  })
  return e
}

// ---- 式変形の確認（shared/schema/math-checks.schema.json）----

export type MathCheckResult = 'same' | 'not_confirmed' | 'unparsed'
export type MathCheck = { stepId: string; before: string; after: string; result: MathCheckResult; detail: string | null }
export type MathChecks = { schemaVersion: '0.1.0'; checks: MathCheck[]; code: string | null }

/**
 * 式変形の確認結果が契約と「使う側で確かめる決まり」（shared/schema/README.md）に合っていれば空配列．
 * stepIds は投稿のステップの id（順番どおり）
 */
export function validateMathChecks(data: unknown, stepIds: string[]): string[] {
  const e: string[] = []
  if (!isObj(data)) return ['ルートがオブジェクトでない']
  onlyKeys(data, ['schemaVersion', 'checks', 'code'], '$', e)
  if (data.schemaVersion !== '0.1.0') e.push(`$.schemaVersion が "0.1.0" でない: ${JSON.stringify(data.schemaVersion)}`)
  if (!Array.isArray(data.checks)) return [...e, '$.checks が配列でない']
  if (data.checks.length === 0 ? data.code !== null : typeof data.code !== 'string' || data.code.length === 0)
    e.push('$.code が，checks が空なら null，そうでなければ空でない文字列，になっていない')
  let prev = -1
  data.checks.forEach((c: unknown, i: number) => {
    const p = `$.checks[${i}]`
    if (!isObj(c)) return void e.push(`${p}: オブジェクトでない`)
    onlyKeys(c, ['stepId', 'before', 'after', 'result', 'detail'], p, e)
    const pos = stepIds.indexOf(c.stepId as string)
    if (pos < 0) e.push(`${p}.stepId ${JSON.stringify(c.stepId)} が投稿のステップに無い`)
    else if (pos < prev) e.push(`${p}: ステップの順に並んでいない`)
    else prev = pos
    for (const k of ['before', 'after'])
      if (typeof c[k] !== 'string' || c[k].length === 0 || c[k].length > 200) e.push(`${p}.${k} が1〜200字の文字列でない`)
    if (c.result !== 'same' && c.result !== 'not_confirmed' && c.result !== 'unparsed')
      e.push(`${p}.result が same / not_confirmed / unparsed でない`)
    if (c.detail !== null && (typeof c.detail !== 'string' || c.detail.length > 200)) e.push(`${p}.detail が null か200字までの文字列でない`)
    if (c.result === 'same' && c.detail !== null) e.push(`${p}.detail が same なのに null でない`)
  })
  return e
}
