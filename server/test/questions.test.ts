// 問いかけ（対象の選び方・Gemini の返り値 → 契約）のテスト．`npm test`（Node 標準の node:test．依存は足さない）
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { validateStepQuestions, type StepAlignment, type ThoughtSteps } from '../src/contract.ts'
import {
  buildQuestionsPrompt,
  normalizeQuestions,
  questionsResponseSchema,
  questionTargets,
  templateQuestions,
} from '../src/questions.ts'

const sample = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../shared/schema/examples/${name}`, import.meta.url), 'utf8'))
const a = sample('image.sample.json') as ThoughtSteps
const b = sample('video.sample.json') as ThoughtSteps
const alignment = sample('alignment.image-video.sample.json') as StepAlignment
const ids = ['s1', 's2', 's3', 's4']

test('対象: split の各側の最初が branch，それ以外で why が null のものが missing_why', () => {
  assert.deepEqual(questionTargets(alignment, a, b), [
    { side: 'a', stepId: 's1', kind: 'branch' }, // why あり（post_quote）でも分岐点なので問う
    { side: 'a', stepId: 's2', kind: 'missing_why' },
    { side: 'a', stepId: 's3', kind: 'missing_why' },
    { side: 'a', stepId: 's4', kind: 'branch' }, // why あり（author）でも分岐点なので問う
    { side: 'b', stepId: 's1', kind: 'branch' },
    { side: 'b', stepId: 's2', kind: 'missing_why' },
    { side: 'b', stepId: 's3', kind: 'missing_why' },
    { side: 'b', stepId: 's4', kind: 'branch' },
  ])
})

test('対象: 片方が空の split ではその側に branch を付けない．split の2つ目以降は branch にしない', () => {
  const al: StepAlignment = {
    schemaVersion: '0.1.0',
    segments: [
      { type: 'same', a: ['s1'], b: ['s1'] },
      { type: 'split', a: ['s2', 's3'], b: [] },
      { type: 'same', a: ['s4'], b: ['s2', 's3', 's4'] },
    ],
  }
  const withWhy = (t: ThoughtSteps): ThoughtSteps => ({
    ...t,
    steps: t.steps.map((s) => ({ ...s, why: { text: 'x', by: 'author' } })),
  })
  assert.deepEqual(questionTargets(al, a, withWhy(b)), [
    { side: 'a', stepId: 's2', kind: 'branch' },
    { side: 'a', stepId: 's3', kind: 'missing_why' },
  ])
})

test('使える問いはそのまま，無い・評価する・理由を挙げる問いは決まった文にする', () => {
  const targets = questionTargets(alignment, a, b).slice(0, 4) // a の4つ
  const { result, warnings } = normalizeQuestions(targets, ids, ids, {
    questions: [
      { target: 'a:s1', text: ' もう1人は新しい素数を作る方針にしました．あなたはなぜ有限個と仮定して始めたのですか？ ' },
      { target: 'a:s1', text: '2つ目なので捨てる？' },
      { target: 'a:s2', text: 'なぜ1を足したのですか，割り切れなくなるからですか？' }, // 理由の候補を挙げている
      { target: 'a:s3', text: 'この確かめ方はどう正しいと思いますか？' }, // 評価の言葉
      { target: 'b:s1', text: '対象に無い？' },
      // a:s4 は返ってこない
    ],
  })
  assert.deepEqual(
    result.questions.map((q) => [q.stepId, q.by]),
    [
      ['s1', 'ai'],
      ['s2', 'template'],
      ['s3', 'template'],
      ['s4', 'template'],
    ],
  )
  assert.equal(result.questions[0].text, 'もう1人は新しい素数を作る方針にしました．あなたはなぜ有限個と仮定して始めたのですか？')
  assert.equal(warnings.length, 5)
  assert.ok(warnings.some((w) => w.includes('理由の候補')))
  assert.ok(warnings.some((w) => w.includes('評価の言葉')))
  assert.ok(warnings.some((w) => w.includes('a:s4 の問いが無い')))
  assert.deepEqual(validateStepQuestions(result, ids, ids), [])
})

test('はい／いいえで答える問いは捨て，「何のため」のように一から問う問いは残す（PR #60 のレビューの表）', () => {
  const cases: [string, 'ai' | 'template'][] = [
    ['N を作ったのは何のためですか？', 'ai'],
    ['それは何のためでしょうか？', 'ai'],
    ['N を作ったのはなぜですか？', 'ai'],
    ['どうしてこの順に確かめたのですか？', 'ai'],
    ['矛盾を導くのが簡単だと考えたのですか？', 'template'],
    ['有限個と仮定すれば矛盾が出ると思ったのでしょうか？', 'template'],
    ['背理法を使ったのですか？', 'template'],
  ]
  for (const [text, by] of cases) {
    const targets = [{ side: 'a', stepId: 's2', kind: 'missing_why' }] as const
    const { result } = normalizeQuestions([...targets], ids, ids, { questions: [{ target: 'a:s2', text }] })
    assert.equal(result.questions[0].by, by, text)
  }
})

test('「？」で終わらない・長すぎる・改行のある問いは捨てる', () => {
  const targets = questionTargets(alignment, a, b).slice(0, 3)
  const { result, warnings } = normalizeQuestions(targets, ids, ids, {
    questions: [
      { target: 'a:s1', text: 'なぜこの方針にしたのか書いてください．' },
      { target: 'a:s2', text: `${'あ'.repeat(120)}？` },
      { target: 'a:s3', text: 'なぜ\nですか？' },
    ],
  })
  assert.ok(result.questions.every((q) => q.by === 'template'))
  assert.equal(warnings.length, 3)
})

test('questions が無い返り値は例外', () => {
  assert.throws(() => normalizeQuestions([], ids, ids, { matches: [] }), /questions/)
})

test('決まった文の問いも契約に合う．サンプルも契約に合う', () => {
  const targets = questionTargets(alignment, a, b)
  assert.deepEqual(validateStepQuestions(templateQuestions(targets), ids, ids), [])
  assert.deepEqual(validateStepQuestions(sample('questions.image-video.sample.json'), ids, ids), [])
})

test('検証: 無い id・並びの崩れ・同じステップへの2つ目を見つける', () => {
  const q = (side: string, stepId: string) => ({ side, stepId, kind: 'missing_why', text: 'なぜ？', by: 'ai' })
  const errors = validateStepQuestions(
    { schemaVersion: '0.1.0', questions: [q('b', 's1'), q('a', 's2'), q('a', 's2'), q('a', 's9')] },
    ids,
    ids,
  )
  assert.ok(errors.some((e) => e.includes('s9')))
  assert.equal(errors.filter((e) => e.includes('並び')).length, 2)
})

test('Gemini への入力: what だけを渡し，why・transcript は渡さない．分岐点にはもう1人の区間を添える', () => {
  const targets = questionTargets(alignment, a, b)
  const prompt = buildQuestionsPrompt({ title: '素数は無限にある', body: '証明せよ' }, a, b, alignment, targets)
  assert.ok(prompt.includes('素数は無限にある'))
  assert.ok(!prompt.includes('"why"') && !prompt.includes('"transcript"'))
  for (const s of [...a.steps, ...b.steps]) {
    if (s.why) assert.ok(!prompt.includes(s.why.text), `why が漏れている: ${s.why.text}`)
    if (s.transcript) assert.ok(!prompt.includes(s.transcript), `transcript が漏れている: ${s.transcript}`)
  }
  assert.ok(prompt.includes(`target "a:s1"（branch）`))
  assert.ok(prompt.includes(`同じ区間で B がしたこと: 「${b.steps[0].what}」`))
  const schema = questionsResponseSchema(targets) as {
    properties: { questions: { items: { properties: { target: { enum: string[] } } } } }
  }
  assert.deepEqual(schema.properties.questions.items.properties.target.enum.slice(0, 2), ['a:s1', 'a:s2'])
})
