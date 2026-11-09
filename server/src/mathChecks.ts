// 思考ステップ → 式変形の組（Gemini が投稿の式を写す）→ SymPy のコード（コードで作る）→ Gemini のコード実行の出力 →
// 契約（shared/schema/math-checks.schema.json）に合う確認結果（docs/decisions/issue-22-sympy-check.md）．
// 設計原則: AI に正誤を判定させない．Gemini は式を写すだけ．同じ式かどうかは SymPy の計算の結果をそのまま使う
import type { Part } from '@google/genai'
import { validateMathChecks, type MathCheck, type MathCheckResult, type MathChecks, type ThoughtSteps } from './contract.ts'

/** 1つの投稿で確かめる式変形の数の上限（費用と画面の長さのため） */
export const MAX_PAIRS = 10
/** 式1つの長さの上限（契約の maxLength と同じ） */
export const MAX_EXPR = 200

export type MathPair = { stepId: string; before: string; after: string }

const EXTRACT_PROMPT = `あなたは学習プラットフォームの「整理役」です．下は，学生が問題を解いた投稿を「思考ステップ」に分けたものです．transcript はそのステップに書かれている式・文（または話した言葉）です．
本人が式を変形した（ある式を「＝」でつないで別の形に書き換えた）ところを，変形前と変形後の式の組として抜き出してください．
- 本人が書いた式をそのまま写す．誤りに見えても直さない．書かれていない式を作らない・補わない
- 「A = B = C」のように続けて書き換えていれば (A, B)，(B, C) の2組にする．前のステップの最後の式から続けて書き換えていれば，before にその式を写し，stepId は書き換えた後の式があるステップにする
- 「M = n! + 1 とおく」のような文字の置き方（定義）や，方程式・不等式を解く変形（両辺に同じ数を足す・移項する など）は含めない．式そのものを同じ値の別の形に書き換えたところだけ
- before・after は SymPy の parse_expr で読める書き方にする．掛け算は *，累乗は **，分数は /，平方根は sqrt()，円周率は pi，ネイピア数は E，虚数単位は I．「＝」や不等号は含めない
- 文字は1文字（添字は x_1 のように書く）かギリシャ文字の名前（theta など）にする．関数は sqrt, cbrt, root, exp, log, sin, cos, tan, Abs, factorial, binomial, floor, ceiling, gcd, lcm などの数学の関数だけを使う
- 式変形が無ければ pairs は空にする
- 解き方が正しいかどうかは判断しない`

/** Gemini の responseJsonSchema．stepId を投稿のステップの id に絞る */
export function pairsResponseSchema(stepIds: string[]): unknown {
  return {
    type: 'object',
    required: ['pairs'],
    additionalProperties: false,
    properties: {
      pairs: {
        description: '式変形ごとに1つ．ステップの順に並べる',
        type: 'array',
        items: {
          type: 'object',
          required: ['stepId', 'before', 'after'],
          additionalProperties: false,
          properties: {
            stepId: { type: 'string', enum: stepIds },
            before: { type: 'string', description: '変形前の式（SymPy の書き方）' },
            after: { type: 'string', description: '変形後の式（SymPy の書き方）' },
          },
        },
      },
    },
  }
}

/** 式を写させるときの本文．ステップの id・what・transcript を渡す（why は渡さない） */
export function buildPairsPrompt(problem: { title: string; body: string }, steps: ThoughtSteps): string {
  const list = steps.steps.map((s) => ({ id: s.id, what: s.what, transcript: s.transcript ?? '' }))
  return `${EXTRACT_PROMPT}

問題: ${problem.title}
${problem.body}

ステップ:
${JSON.stringify(list, null, 1)}`
}

/** 式として受け付ける文字．Python のコードに埋め込むので，引用符・バックスラッシュ・改行などは通さない */
const EXPR_CHARS = /^[A-Za-z0-9_+\-*/^()., !]+$/

// 式の中で使える名前．parse_expr は中で eval するので，print・chr のような関数や __class__ のような属性を通すと，
// 投稿に仕込んだ式で結果の行を作れてしまう（PR #69 のレビュー）．1文字の変数（x，x1，x_1）と，下の数学の名前だけにする
const ALLOWED_NAMES = new Set([
  // 関数
  'sqrt', 'cbrt', 'root', 'exp', 'log', 'ln', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'Abs', 'abs', 'factorial', 'binomial', 'floor', 'ceiling', 'gcd', 'lcm', 'Rational',
  // 定数（E・I は1文字なので下の決まりで通る）
  'pi', 'oo',
  // ギリシャ文字（lambda は Python の予約語なので入れない）
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'mu', 'nu', 'xi',
  'rho', 'sigma', 'tau', 'phi', 'chi', 'psi', 'omega',
])
const SINGLE_VARIABLE = /^[A-Za-z](_?[0-9]+)?$/

function exprProblem(e: string): string | undefined {
  if (e.length === 0) return '式が空な'
  if (e.length > MAX_EXPR) return `式が ${MAX_EXPR} 字を超える`
  if (!EXPR_CHARS.test(e)) return `式に使えない文字がある (${JSON.stringify(e)})`
  // 小数（0.5・.5）は通し，属性（x.subs）は通さない
  if (/\.[A-Za-z_]/.test(e)) return `式に属性の参照がある (${JSON.stringify(e)})`
  const bad = (e.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).find((n) => !SINGLE_VARIABLE.test(n) && !ALLOWED_NAMES.has(n))
  if (bad) return `式に使えない名前 ${JSON.stringify(bad)} がある`
  return undefined
}

/**
 * Gemini が写した組を確かめる．ステップに無い id・空・長すぎる・使えない文字を含む・前後が同じ文字列の組は捨てる．
 * ステップの順に並べ直し，上限を超えた分は捨てる
 */
export function normalizePairs(stepIds: string[], raw: unknown): { pairs: MathPair[]; warnings: string[] } {
  const warnings: string[] = []
  const rawPairs = (raw as { pairs?: unknown })?.pairs
  if (!Array.isArray(rawPairs)) throw new Error('Gemini の返り値に pairs の配列がない')
  const pairs: MathPair[] = []
  rawPairs.forEach((p: { stepId?: unknown; before?: unknown; after?: unknown }, i) => {
    const label = `式変形の${i + 1}番目`
    if (typeof p?.stepId !== 'string' || !stepIds.includes(p.stepId))
      return void warnings.push(`${label}: ステップに無い stepId ${JSON.stringify(p?.stepId)} なので捨てた`)
    const [before, after] = [p.before, p.after].map((e) => (typeof e === 'string' ? e.trim() : ''))
    const problem = exprProblem(before) ?? exprProblem(after)
    if (problem) return void warnings.push(`${label}: ${problem}ので捨てた`)
    if (before === after) return void warnings.push(`${label}: 前後が同じ文字列なので捨てた`)
    pairs.push({ stepId: p.stepId, before, after })
  })
  // 並べ直しは安定ソートなので，同じステップの中では Gemini の順のまま
  pairs.sort((x, y) => stepIds.indexOf(x.stepId) - stepIds.indexOf(y.stepId))
  if (pairs.length > MAX_PAIRS) {
    warnings.push(`式変形が ${pairs.length} 組あったので，先頭の ${MAX_PAIRS} 組だけ確かめた`)
    pairs.length = MAX_PAIRS
  }
  return { pairs, warnings }
}

/** 結果の行の先頭．Gemini の地の文と見分ける */
export const OUTPUT_PREFIX = 'MATHCHECK '

/**
 * SymPy で確かめるコード．式は JSON の文字列としてリストに入れる（JSON の文字列・配列は Python のリテラルとしても読める．
 * 式の文字は normalizePairs で絞ってある）．same は simplify(before - after) が 0，または equals(0) が True のとき
 */
export function buildSympyCode(pairs: MathPair[]): string {
  const list = JSON.stringify(pairs.map((p) => [p.before, p.after]))
  return `import json
from sympy import Symbol, simplify
from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application, convert_xor

T = standard_transformations + (implicit_multiplication_application, convert_xor)
# SymPy で関数や定数の名前になっている1文字を，ただの文字として読む
L = {k: Symbol(k) for k in ["N", "S", "Q", "O", "C", "beta", "gamma", "zeta"]}
PAIRS = ${list}

for i, (before, after) in enumerate(PAIRS):
    try:
        a = parse_expr(before, local_dict=L, transformations=T)
        b = parse_expr(after, local_dict=L, transformations=T)
        d = simplify(a - b)
        same = d == 0 or (a - b).equals(0) is True
        r = {"i": i, "result": "same" if same else "not_confirmed", "detail": None if same else str(d)[:${MAX_EXPR}]}
    except Exception as e:
        r = {"i": i, "result": "unparsed", "detail": type(e).__name__}
    print("${OUTPUT_PREFIX}" + json.dumps(r))
`
}

// 「ツールを必ず使う」「出力を予想して書かない」が無いと，gemini-3.1-flash-lite は実行せずに出力らしい文を書いた（6回中6回）．
// 足すと14回中14回，こちらのコードをそのまま実行した（docs/decisions/issue-22-sympy-check.md）
export const RUN_PROMPT = `コード実行ツールを必ず使って，次の Python のコードを一字も変えずに1回だけ実行してください．コードを書き換えたり，別のコードを足したりしないでください．出力を自分で予想して書いてはいけません．実行したあとの説明は要りません．`

/** コードを実行させるときの parts */
export function buildRunParts(code: string): Part[] {
  return [{ text: `${RUN_PROMPT}\n\n\`\`\`python\n${code}\`\`\`` }]
}

/** 改行の種類と行末の空白・前後の空行の違いは同じコードとみなす */
const sameCode = (x: string, y: string) => {
  const norm = (s: string) =>
    s
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((l) => l.trimEnd())
      .join('\n')
      .trim()
  return norm(x) === norm(y)
}

/**
 * Gemini のコード実行の返り値（parts）から，こちらのコードを実行した出力を取り出して確認結果にする．
 * Gemini の地の文は使わない．こちらのコードと違うコードの出力は使わない（Gemini が書き換えたコードの結果を信じない）
 */
export function parseRunResult(pairs: MathPair[], code: string, parts: Part[]): { result: MathChecks; warnings: string[] } {
  const warnings: string[] = []
  // executableCode の直後の codeExecutionResult がそのコードの出力
  let output: string | undefined
  parts.forEach((part, i) => {
    if (output !== undefined || !part.executableCode) return
    if (!sameCode(part.executableCode.code ?? '', code)) return void warnings.push('Gemini がこちらのコードと違うコードを実行したので，その出力は使わなかった')
    const res = parts[i + 1]?.codeExecutionResult
    if (res?.outcome !== 'OUTCOME_OK') return void warnings.push(`コードの実行が ${res?.outcome ?? '結果なし'} だった`)
    output = res.output ?? ''
  })
  if (output === undefined) throw new Error(`こちらのコードを実行した出力が無い (${warnings.join(' / ') || 'コードの実行なし'})`)

  const byIndex = new Map<number, { result: MathCheckResult; detail: string | null }>()
  const seen = new Set<number>()
  const duplicated = new Set<number>()
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith(OUTPUT_PREFIX)) continue
    const r = JSON.parse(line.slice(OUTPUT_PREFIX.length)) as { i?: unknown; result?: unknown; detail?: unknown }
    if (!Number.isInteger(r.i)) continue
    const i = r.i as number
    // こちらのコードは1つの組に1行しか出さない．2行目があれば，式が何かを出力した疑いがあるので確かめていない扱いにする
    if (seen.has(i)) {
      duplicated.add(i)
      continue
    }
    seen.add(i)
    if (r.result !== 'same' && r.result !== 'not_confirmed' && r.result !== 'unparsed') continue
    const detail = typeof r.detail === 'string' ? r.detail.slice(0, MAX_EXPR) : null
    byIndex.set(i, { result: r.result, detail: r.result === 'same' ? null : detail })
  }

  const checks: MathCheck[] = pairs.map((p, i) => {
    if (duplicated.has(i)) {
      warnings.push(`式変形の${i + 1}番目の出力が2行以上あったので unparsed にした`)
      return { ...p, result: 'unparsed', detail: null }
    }
    const r = byIndex.get(i)
    if (r) return { ...p, ...r }
    // 出力が欠けた組は，確かめられていないので unparsed にする（same にはしない）
    warnings.push(`式変形の${i + 1}番目の出力が無いので unparsed にした`)
    return { ...p, result: 'unparsed', detail: null }
  })
  return { result: { schemaVersion: '0.1.0', checks, code }, warnings }
}

/** 式変形が無かったときの結果 */
export const emptyMathChecks = (): MathChecks => ({ schemaVersion: '0.1.0', checks: [], code: null })

/** 保存する前に契約に合うかを確かめる */
export function assertMathChecks(result: MathChecks, stepIds: string[]) {
  const errors = validateMathChecks(result, stepIds)
  if (errors.length) throw new Error(`契約に合わない: ${errors.join(' / ')}`)
}
