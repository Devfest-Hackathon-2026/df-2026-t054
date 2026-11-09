// 対応関係の整形（Gemini の返り値 → 契約）のテスト．`npm test`（Node 標準の node:test．依存は足さない）
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { alignmentResponseSchema, buildAlignmentPrompt, normalizeAlignment } from '../src/alignment.ts'
import { validateStepAlignment, type ThoughtSteps } from '../src/contract.ts'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`)
const sample = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../shared/schema/examples/${name}`, import.meta.url), 'utf8'))

test('組を区間に並べる: 分岐・合流・最後にまた分岐', () => {
  const { result, warnings } = normalizeAlignment(ids(4), ids(4), {
    matches: [
      { a: ['s2'], b: ['s2'] },
      { a: ['s3'], b: ['s3'] },
    ],
  })
  assert.deepEqual(result, sample('alignment.image-video.sample.json'))
  assert.deepEqual(warnings, [])
})

test('1つと複数の組，片方だけの寄り道', () => {
  const { result } = normalizeAlignment(ids(3), ids(5), {
    matches: [
      { a: ['s1'], b: ['s1', 's2'] },
      { a: ['s3'], b: ['s5'] },
    ],
  })
  assert.deepEqual(result.segments, [
    { type: 'same', a: ['s1'], b: ['s1', 's2'] },
    { type: 'split', a: ['s2'], b: ['s3', 's4'] },
    { type: 'same', a: ['s3'], b: ['s5'] },
  ])
})

test('b だけが寄り道したときは a が空の split', () => {
  const { result } = normalizeAlignment(ids(2), ids(3), {
    matches: [
      { a: ['s1'], b: ['s1'] },
      { a: ['s2'], b: ['s3'] },
    ],
  })
  assert.deepEqual(result.segments[1], { type: 'split', a: [], b: ['s2'] })
})

test('組が無ければ全体が1つの split', () => {
  const { result } = normalizeAlignment(ids(2), ids(3), { matches: [] })
  assert.deepEqual(result.segments, [{ type: 'split', a: ['s1', 's2'], b: ['s1', 's2', 's3'] }])
})

test('順番が食い違う組は，対応するステップが多くなる方を残して捨てる', () => {
  const { result, warnings } = normalizeAlignment(ids(3), ids(3), {
    matches: [
      { a: ['s1'], b: ['s3'] }, // 交差する
      { a: ['s2'], b: ['s1'] },
      { a: ['s3'], b: ['s2'] },
    ],
  })
  assert.deepEqual(result.segments, [
    { type: 'split', a: ['s1'], b: [] },
    { type: 'same', a: ['s2'], b: ['s1'] },
    { type: 'same', a: ['s3'], b: ['s2'] },
    { type: 'split', a: [], b: ['s3'] },
  ])
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /\[s1\]↔\[s3\]/)
})

test('重なる組・無い id・続いていない組・空の組は捨てる', () => {
  const { result, warnings } = normalizeAlignment(ids(4), ids(4), {
    matches: [
      { a: ['s1'], b: ['s1'] },
      { a: ['s1'], b: ['s2'] }, // a の s1 が重なる
      { a: ['s9'], b: ['s3'] },
      { a: ['s2', 's4'], b: ['s4'] },
      { a: [], b: ['s4'] },
      { a: 's2', b: ['s2'] }, // 配列でない
    ],
  })
  assert.deepEqual(result.segments, [
    { type: 'same', a: ['s1'], b: ['s1'] },
    { type: 'split', a: ['s2', 's3', 's4'], b: ['s2', 's3', 's4'] },
  ])
  assert.equal(warnings.length, 5)
  assert.ok(warnings.some((w) => w.includes('a が配列でない')))
})

test('matches が無い返り値は例外', () => {
  assert.throws(() => normalizeAlignment(ids(1), ids(1), { steps: [] }), /matches/)
})

test('検証: 抜け・split の連続・空の same を見つける', () => {
  const bad = {
    schemaVersion: '0.1.0',
    segments: [
      { type: 'split', a: ['s1'], b: [] },
      { type: 'split', a: [], b: ['s1'] },
      { type: 'same', a: [], b: ['s2'] },
    ],
  }
  const errors = validateStepAlignment(bad, ids(2), ids(2))
  assert.ok(errors.some((e) => e.includes('split が続いている')))
  assert.ok(errors.some((e) => e.includes('same なのに')))
  assert.ok(errors.some((e) => e.includes('a をつないだ')))
  assert.deepEqual(validateStepAlignment(sample('alignment.image-video.sample.json'), ids(4), ids(4)), [])
})

test('Gemini への入力: 問題とステップの what・transcript を渡し，why の項目は渡さない．id は enum で絞る', () => {
  const a = sample('image.sample.json') as ThoughtSteps
  const b = sample('video.sample.json') as ThoughtSteps
  const prompt = buildAlignmentPrompt({ title: '素数は無限にある', body: '証明せよ' }, a, b)
  assert.ok(prompt.includes('素数は無限にある'))
  assert.ok(prompt.includes(a.steps[1].what) && prompt.includes(b.steps[1].what))
  assert.ok(!prompt.includes('"why"'))
  const schema = alignmentResponseSchema(['s1', 's2'], ['s1']) as {
    properties: { matches: { items: { properties: { a: { items: { enum: string[] } } } } } }
  }
  assert.deepEqual(schema.properties.matches.items.properties.a.items.enum, ['s1', 's2'])
})
