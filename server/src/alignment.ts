// 2つの投稿の思考ステップ → Gemini への入力，Gemini の返り値 → 契約（shared/schema/step-alignment.schema.json）に合う対応関係．
// Gemini には「同じことをしたステップの組」だけを答えさせ，順番の食い違いを捨てて区間に並べるのはコードで行う
import { validateStepAlignment, type Segment, type StepAlignment, type ThoughtSteps } from './contract.ts'

export type ProblemText = { title: string; body: string }

// 設計原則: AI は正誤やどちらがよいかを判定しない．答えや理由を書かない．組を返すだけ
const PROMPT = `あなたは学習プラットフォームの「整理役」です．同じ問題を2人の学生（A と B）が別々に解き，それぞれの解き方を「思考ステップ」の列に分けてあります．
2人のステップのうち，同じことをしている組を見つけてください．
- 「同じこと」とは，解き方の中で同じ役割を果たしていること（同じ式を作る・同じ性質を確かめる・同じ方針を立てる など）．記号・書き方・説明の細かさが違っても，していることが同じなら組にする
- 片方の1つのステップが，もう片方の続いた複数のステップにあたるときは，まとめて1つの組にする（a: ["s3"], b: ["s3", "s4"] など）．1つの組に入れるステップは，それぞれの列の中で続いていること
- 組どうしの順番は，A でも B でも同じ向きにする（ある組より後ろの A のステップは，B でもその組より後ろ）
- 同じことをしているステップがなければ，組にしない（無理に組にしない）．1つも無ければ matches は空にする
- 正しい・誤っている・どちらがよい，は判断しない．理由や説明は書かない
- 各ステップの what は整理した要約，transcript は原本の書き起こし（あれば）．両方を見て判断する`

/** Gemini の responseJsonSchema．id を実際のステップの id に絞る（返り値の id の誤りを減らす） */
export function alignmentResponseSchema(aIds: string[], bIds: string[]): unknown {
  const ids = (list: string[]) => ({ type: 'array', minItems: 1, items: { type: 'string', enum: list } })
  return {
    type: 'object',
    required: ['matches'],
    additionalProperties: false,
    properties: {
      matches: {
        description: '同じことをしているステップの組．A の順に並べる',
        type: 'array',
        items: {
          type: 'object',
          required: ['a', 'b'],
          additionalProperties: false,
          properties: { a: ids(aIds), b: ids(bIds) },
        },
      },
    },
  }
}

/**
 * Gemini に渡す本文．ステップは id・what・transcript だけを渡す（why の項目・元の場所は渡さない）．
 * ただし post_quote の why.text は transcript の一部なので，その文は transcript として届く（012）
 */
export function buildAlignmentPrompt(problem: ProblemText, a: ThoughtSteps, b: ThoughtSteps): string {
  const list = (t: ThoughtSteps) =>
    JSON.stringify(
      t.steps.map((s) => ({ id: s.id, what: s.what, ...(s.transcript !== undefined && { transcript: s.transcript }) })),
      null,
      1,
    )
  return `${PROMPT}

問題: ${problem.title}
${problem.body}

A のステップ:
${list(a)}

B のステップ:
${list(b)}`
}

type Match = { a: [number, number]; b: [number, number] } // それぞれの列の [最初, 最後] の位置

export type NormalizedAlignment = { result: StepAlignment; warnings: string[] }

/**
 * Gemini の返り値を契約に合う対応関係に直す．id が無い・続いていない組は捨て，
 * 順番が食い違う組は，対応するステップの数が最も多くなるように選んで残りを捨てる（warnings に残す）．
 * 組が1つも残らなければ，全体が1つの split になる（失敗にはしない）
 */
export function normalizeAlignment(aIds: string[], bIds: string[], raw: unknown): NormalizedAlignment {
  const warnings: string[] = []
  const rawMatches = (raw as { matches?: unknown })?.matches
  if (!Array.isArray(rawMatches)) throw new Error('Gemini の返り値に matches の配列がない')

  const matches: Match[] = []
  rawMatches.forEach((m: { a?: unknown; b?: unknown }, i) => {
    const label = `${i + 1}番目の組`
    const ra = range(m?.a, aIds)
    const rb = range(m?.b, bIds)
    if (typeof ra === 'string') return void warnings.push(`${label}: a が${ra}ので捨てた`)
    if (typeof rb === 'string') return void warnings.push(`${label}: b が${rb}ので捨てた`)
    matches.push({ a: ra, b: rb })
  })

  const chosen = longestChain(matches)
  for (const m of matches)
    if (!chosen.includes(m))
      warnings.push(`組 ${fmt(aIds, m.a)}↔${fmt(bIds, m.b)} は他の組と順番が食い違う・重なるので捨てた`)

  const segments: Segment[] = []
  let ai = 0
  let bi = 0
  const pushSplit = (aEnd: number, bEnd: number) => {
    if (ai < aEnd || bi < bEnd) segments.push({ type: 'split', a: aIds.slice(ai, aEnd), b: bIds.slice(bi, bEnd) })
  }
  for (const m of chosen) {
    pushSplit(m.a[0], m.b[0])
    segments.push({ type: 'same', a: aIds.slice(m.a[0], m.a[1] + 1), b: bIds.slice(m.b[0], m.b[1] + 1) })
    ai = m.a[1] + 1
    bi = m.b[1] + 1
  }
  pushSplit(aIds.length, bIds.length)

  const result: StepAlignment = { schemaVersion: '0.1.0', segments }
  const errors = validateStepAlignment(result, aIds, bIds)
  if (errors.length) throw new Error(`契約に合わない: ${errors.join(' / ')}`)
  return { result, warnings }
}

/** 組の片側の id を，列の中の [最初, 最後] の位置にする．続いていなければ捨てる理由を返す */
function range(ids: unknown, all: string[]): [number, number] | string {
  if (!Array.isArray(ids)) return `配列でない (${JSON.stringify(ids)})`
  if (ids.length === 0) return '空な'
  const pos = [...new Set(ids)].map((id) => all.indexOf(id as string)).sort((x, y) => x - y)
  if (pos.some((p) => p < 0)) return `無い id を含む (${JSON.stringify(ids)})`
  if (pos.at(-1)! - pos[0] + 1 !== pos.length) return `続いていない (${JSON.stringify(ids)})`
  return [pos[0], pos.at(-1)!]
}

/** a でも b でも前から順に並び，重ならない組の選び方のうち，含むステップの数が最も多いもの */
function longestChain(matches: Match[]): Match[] {
  const ms = [...matches].sort((x, y) => x.a[0] - y.a[0] || x.b[0] - y.b[0])
  const weight = (m: Match) => m.a[1] - m.a[0] + 1 + (m.b[1] - m.b[0] + 1)
  const best: number[] = []
  const prev: number[] = []
  ms.forEach((m, i) => {
    best[i] = weight(m)
    prev[i] = -1
    for (let j = 0; j < i; j++)
      if (ms[j].a[1] < m.a[0] && ms[j].b[1] < m.b[0] && best[j] + weight(m) > best[i]) {
        best[i] = best[j] + weight(m)
        prev[i] = j
      }
  })
  if (ms.length === 0) return []
  let i = best.indexOf(Math.max(...best))
  const chain: Match[] = []
  for (; i >= 0; i = prev[i]) chain.unshift(ms[i])
  return chain
}

const fmt = (ids: string[], [s, e]: [number, number]) => `[${ids.slice(s, e + 1).join(',')}]`
