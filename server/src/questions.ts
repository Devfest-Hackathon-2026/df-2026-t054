// 2つの投稿の対応関係 → 問いかけの対象（分岐点・why が空のステップ），Gemini への入力，
// Gemini の返り値 → 契約（shared/schema/step-questions.schema.json）に合う問いかけ（docs/decisions/015-ai-questions.md）．
// どのステップに問うかはコードで決め，Gemini には問いの文だけを書かせる
import {
  questionTextProblem,
  validateStepQuestions,
  type Question,
  type QuestionKind,
  type StepAlignment,
  type StepQuestions,
  type ThoughtSteps,
} from './contract.ts'
import type { ProblemText } from './alignment.ts'

export type Side = 'a' | 'b'
export type QuestionTarget = { side: Side; stepId: string; kind: QuestionKind }

/** Gemini の返り値の target．"a:s2" のように側とステップの id をつなぐ */
export const targetKey = (t: { side: Side; stepId: string }) => `${t.side}:${t.stepId}`

/**
 * 問いを付けるステップ．並びは a の順，次に b の順．
 * - branch: split の区間で，その側にステップがあれば最初の1つ（道が分かれて最初にしたこと）．why があっても問う
 *   （もう1人と比べた「なぜこちらを選んだか」は，投稿の中の理由とは別の問いになるため）
 * - missing_why: それ以外で why が null のステップ
 */
export function questionTargets(alignment: StepAlignment, a: ThoughtSteps, b: ThoughtSteps): QuestionTarget[] {
  const branch = new Set<string>()
  for (const seg of alignment.segments)
    if (seg.type === 'split') for (const side of ['a', 'b'] as const) if (seg[side].length) branch.add(targetKey({ side, stepId: seg[side][0] }))
  return (['a', 'b'] as const).flatMap((side) =>
    (side === 'a' ? a : b).steps.flatMap((s): QuestionTarget[] => {
      if (branch.has(targetKey({ side, stepId: s.id }))) return [{ side, stepId: s.id, kind: 'branch' }]
      return s.why === null ? [{ side, stepId: s.id, kind: 'missing_why' }] : []
    }),
  )
}

// 設計原則: AI は答えや理由を書かない．正誤やどちらがよいかを判定しない．問いかけるだけ
const PROMPT = `あなたは学習プラットフォームの「問いかけ役」です．同じ問題を2人の学生（A と B）が別々に解き，それぞれの解き方を「思考ステップ」の列に分けてあります．
下の「問いを書く対象」のステップごとに，そのステップを書いた本人に向けた問いを1つずつ書いてください．本人が自分の言葉で理由を書けるようにするための問いです．
- 問うだけにする．答え・理由・ヒント・次にすべきことを書かない
- 理由の候補を挙げて確かめる問い（「〜だからですか？」「〜の方が簡単だったのですか？」）にしない．「なぜ」「どうして」「何を考えて」のように，理由を本人が一から書く形で問う
- 正しい・誤っている・どちらがよい・うまい，などの評価をしない．どちらかの解き方をほめたり勧めたりしない
- 本人に「あなた」と話しかける．相手のことは「もう1人」と呼ぶ（A・B と呼ばない）
- branch（分岐点）: 2人の道がここで分かれた．もう1人がそこでしたことに短く触れて，本人がなぜこちらを選んだのかを問う．もう1人に対応するステップが無いときは「もう1人はこの段階を通らずに進んだ」ことに触れてよい
- missing_why: 本人がそのステップでなぜそうしたのかを問う．何をしたかに具体的に触れる
- 1つの問いは1文で，60字くらいまで．「？」で終える．改行しない
- 各ステップの what は「何をしたか」を整理した要約．書かれていないことを付け足さない`

/** Gemini の responseJsonSchema．target を対象のキーに絞る */
export function questionsResponseSchema(targets: QuestionTarget[]): unknown {
  return {
    type: 'object',
    required: ['questions'],
    additionalProperties: false,
    properties: {
      questions: {
        description: '問いを書く対象ごとに1つ．対象の順に並べる',
        type: 'array',
        items: {
          type: 'object',
          required: ['target', 'text'],
          additionalProperties: false,
          properties: {
            target: { type: 'string', enum: targets.map(targetKey) },
            text: { type: 'string', description: '本人に向けた問い．1文で「？」で終える' },
          },
        },
      },
    },
  }
}

/**
 * Gemini に渡す本文．ステップは id と what だけを渡す（why・transcript・元の場所は渡さない）．
 * 分岐点では，もう1人が同じ区間でしたことをコードで添える
 */
export function buildQuestionsPrompt(
  problem: ProblemText,
  a: ThoughtSteps,
  b: ThoughtSteps,
  alignment: StepAlignment,
  targets: QuestionTarget[],
): string {
  const steps = { a, b }
  const what = (side: Side, id: string) => steps[side].steps.find((s) => s.id === id)?.what ?? ''
  const list = (t: ThoughtSteps) => JSON.stringify(t.steps.map((s) => ({ id: s.id, what: s.what })), null, 1)
  const name = (side: Side) => side.toUpperCase()
  const other = (side: Side): Side => (side === 'a' ? 'b' : 'a')

  const lines = targets.map((t) => {
    const head = `- target "${targetKey(t)}"（${t.kind}）: ${name(t.side)} の ${t.stepId}「${what(t.side, t.stepId)}」`
    if (t.kind !== 'branch') return head
    const seg = alignment.segments.find((s) => s.type === 'split' && s[t.side][0] === t.stepId)
    const o = other(t.side)
    const theirs = seg?.[o] ?? []
    return theirs.length
      ? `${head}\n  同じ区間で ${name(o)} がしたこと: ${theirs.map((id) => `「${what(o, id)}」`).join('→')}`
      : `${head}\n  同じ区間で ${name(o)} がしたこと: なし（${name(o)} はこの段階を通らずに進んだ）`
  })

  return `${PROMPT}

問題: ${problem.title}
${problem.body}

A のステップ:
${list(a)}

B のステップ:
${list(b)}

問いを書く対象:
${lines.join('\n')}`
}

// 理由を一から問う疑問詞．はい／いいえで答える問い（「〜と考えたのですか？」）はほぼ必ず理由の候補を含むので，
// これを含まない問いは捨てる（PR #60 のレビュー）
const OPEN_QUESTION = /なぜ|どうして|何|なに|どの|どう|どんな/

// 答えや理由を書いた・評価した問いを捨てる目安．漏れはありうる（README と 015 に書いた）
const LEADING = [
  { re: OPEN_QUESTION, negate: true, why: '理由を一から問う疑問詞（なぜ・どうして・何・どの・どう・どんな）を含まない' },
  // 「何のためですか」は目的を一から問う良い問いなので，ため は目安に入れない
  { re: /(から|ので|のに)(です|でしょう)?か?[？?]$/, why: '理由の候補を挙げて確かめている' },
  { re: /(では|じゃ)ない(です|でしょう)?か[？?]$/, why: '答えをほのめかしている' },
  { re: /正しい|正しく|誤り|誤っ|間違|ミス|どちらが(よい|良い|優れ)|の方が(よい|良い|簡単|分かりやすい|わかりやすい)|うまい|上手/, why: '評価の言葉を含む' },
]

/** Gemini の問いが使えないときの決まった文 */
export function templateText(kind: QuestionKind): string {
  return kind === 'branch'
    ? 'ここでもう1人とは別の進め方になりました．あなたがこの進め方を選んだのはなぜですか？'
    : 'このステップでこうしたのはなぜですか？'
}

/** 対象ごとに決まった文の問いを作る（Gemini を呼べなかったとき） */
export function templateQuestions(targets: QuestionTarget[]): StepQuestions {
  return { schemaVersion: '0.1.0', questions: targets.map((t) => ({ ...t, text: templateText(t.kind), by: 'template' })) }
}

export type NormalizedQuestions = { result: StepQuestions; warnings: string[] }

/**
 * Gemini の返り値を契約に合う問いかけに直す．対象ごとに最初の使える問いを採り，
 * 無い・決まりに合わない・答えや評価を含む問いは決まった文に置き換える（warnings に残す）．
 * 対象に無い target や，同じ対象への2つ目以降の問いは捨てる
 */
export function normalizeQuestions(targets: QuestionTarget[], aIds: string[], bIds: string[], raw: unknown): NormalizedQuestions {
  const warnings: string[] = []
  const rawQuestions = (raw as { questions?: unknown })?.questions
  if (!Array.isArray(rawQuestions)) throw new Error('Gemini の返り値に questions の配列がない')

  const wanted = new Set(targets.map(targetKey))
  const texts = new Map<string, string>()
  rawQuestions.forEach((q: { target?: unknown; text?: unknown }, i) => {
    const label = `${i + 1}番目の問い`
    const key = q?.target
    if (typeof key !== 'string' || !wanted.has(key)) return void warnings.push(`${label}: 対象に無い target ${JSON.stringify(key)} なので捨てた`)
    if (texts.has(key)) return void warnings.push(`${label}: ${key} に2つ目の問いなので捨てた`)
    const text = typeof q.text === 'string' ? q.text.trim() : q.text
    const problem =
      questionTextProblem(text) ?? LEADING.find((l) => l.re.test(text as string) !== Boolean(l.negate))?.why
    if (problem) return void warnings.push(`${label}: ${key} の問いが${problem}ので捨てた (${JSON.stringify(q.text)})`)
    texts.set(key, text as string)
  })

  const questions: Question[] = targets.map((t) => {
    const text = texts.get(targetKey(t))
    if (text !== undefined) return { ...t, text, by: 'ai' }
    if (!warnings.some((w) => w.includes(` ${targetKey(t)} の問いが`))) warnings.push(`${targetKey(t)} の問いが無いので決まった文にした`)
    return { ...t, text: templateText(t.kind), by: 'template' }
  })
  const result: StepQuestions = { schemaVersion: '0.1.0', questions }
  const errors = validateStepQuestions(result, aIds, bIds)
  if (errors.length) throw new Error(`契約に合わない: ${errors.join(' / ')}`)
  return { result, warnings }
}
