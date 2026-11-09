// 式変形の確認（Gemini が写した組の確かめ・SymPy のコード・コード実行の出力 → 契約）のテスト．`npm test`
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { Part } from '@google/genai'
import { validateMathChecks, type MathChecks } from '../src/contract.ts'
import { buildSympyCode, MAX_PAIRS, normalizePairs, OUTPUT_PREFIX, parseRunResult, type MathPair } from '../src/mathChecks.ts'

const sample = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../shared/schema/examples/${name}`, import.meta.url), 'utf8'))
const ids = ['s1', 's2']
const pairs: MathPair[] = [
  { stepId: 's1', before: '(x + 1)**2', after: 'x**2 + 2*x + 1' },
  { stepId: 's2', before: '(x - 1)**2', after: 'x**2 - 2*x - 1' },
]
const out = (rows: unknown[]) => rows.map((r) => OUTPUT_PREFIX + JSON.stringify(r)).join('\n') + '\n'
const ran = (code: string, output: string, outcome = 'OUTCOME_OK'): Part[] => [
  { executableCode: { language: 'PYTHON' as never, code } },
  { codeExecutionResult: { outcome: outcome as never, output } },
  // Gemini の地の文．使わない
  { text: out([{ i: 0, result: 'same', detail: null }, { i: 1, result: 'same', detail: null }]) },
]

test('契約のサンプルは validateMathChecks を通り，code は buildSympyCode で作ったもの', () => {
  const s = sample('math-checks.algebra.sample.json') as MathChecks
  assert.deepEqual(validateMathChecks(s, ids), [])
  assert.equal(s.code, buildSympyCode(s.checks.map(({ stepId, before, after }) => ({ stepId, before, after }))))
})

test('組: ステップに無い id・使えない文字・前後が同じ組は捨て，ステップの順に並べる', () => {
  const { pairs: got, warnings } = normalizePairs(ids, {
    pairs: [
      { stepId: 's2', before: 'a + a', after: '2*a' },
      { stepId: 's9', before: 'x', after: 'y' },
      { stepId: 's1', before: '"); import os; ("', after: 'x' },
      { stepId: 's1', before: 'x\\ny', after: 'x' },
      { stepId: 's1', before: 'x*x', after: 'x*x' },
      { stepId: 's1', before: ' x*x ', after: 'x^2' },
      { stepId: 's1', before: '', after: 'x' },
    ],
  })
  assert.deepEqual(got, [
    { stepId: 's1', before: 'x*x', after: 'x^2' },
    { stepId: 's2', before: 'a + a', after: '2*a' },
  ])
  assert.equal(warnings.length, 5)
})

test('組: Python の関数・属性・使えない名前を含む式は捨て，数学の名前と小数は通す（PR #69 のレビュー）', () => {
  const bad = ['().__class__.__base__', 'print(chr(77)+chr(65))', 'x.subs(x, 2)', 'eval(x)', 'xy + 1', 'exec(x)']
  const { pairs: got, warnings } = normalizePairs(ids, { pairs: bad.map((before) => ({ stepId: 's1', before, after: 'x' })) })
  assert.deepEqual(got, [])
  assert.equal(warnings.length, bad.length)
  const good = ['sqrt(x_1^2) + 0.5', 'sin(theta)^2 + cos(theta)^2', 'E^(I*pi)', 'n! + 1', 'binomial(n, k) + .5', '2 x y']
  assert.equal(normalizePairs(ids, { pairs: good.map((before) => ({ stepId: 's1', before, after: 'x' })) }).pairs.length, good.length)
})

test('組: 上限を超えた分は捨てる．pairs が無ければ例外', () => {
  const many = Array.from({ length: MAX_PAIRS + 3 }, (_, i) => ({ stepId: 's1', before: `x + ${i}`, after: `${i} + x` }))
  const { pairs: got, warnings } = normalizePairs(ids, { pairs: many })
  assert.equal(got.length, MAX_PAIRS)
  assert.match(warnings[0], /先頭の/)
  assert.throws(() => normalizePairs(ids, {}), /pairs の配列がない/)
})

test('コード: 式は JSON の文字列としてリストに入る', () => {
  const code = buildSympyCode(pairs)
  assert.ok(code.includes('PAIRS = [["(x + 1)**2","x**2 + 2*x + 1"],["(x - 1)**2","x**2 - 2*x - 1"]]'))
})

test('出力: こちらのコードの出力だけを使い，Gemini の地の文は使わない', () => {
  const code = buildSympyCode(pairs)
  const { result, warnings } = parseRunResult(
    pairs,
    code,
    ran(code.replace(/\n/g, '\r\n') + '\n\n', out([{ i: 0, result: 'same', detail: 'x' }, { i: 1, result: 'not_confirmed', detail: '2' }])),
  )
  assert.deepEqual(warnings, [])
  assert.deepEqual(result.checks.map((c) => [c.result, c.detail]), [
    ['same', null], // same のときは detail を null にする
    ['not_confirmed', '2'],
  ])
  assert.equal(result.code, code)
  assert.deepEqual(validateMathChecks(result, ids), [])
})

test('出力: Gemini が書き換えたコードの出力は使わない', () => {
  const code = buildSympyCode(pairs)
  const changed = code.replace('same = d == 0', 'same = True')
  assert.throws(() => parseRunResult(pairs, code, ran(changed, out([{ i: 0, result: 'same', detail: null }]))), /出力が無い/)
  assert.throws(() => parseRunResult(pairs, code, [{ text: out([{ i: 0, result: 'same', detail: null }]) }]), /出力が無い/)
  assert.throws(() => parseRunResult(pairs, code, ran(code, '', 'OUTCOME_FAILED')), /出力が無い/)
})

test('出力: 欠けた・読めない行の組は same にせず unparsed にする', () => {
  const code = buildSympyCode(pairs)
  const output = `${OUTPUT_PREFIX}{"i": 1, "result": "maybe"}\n${OUTPUT_PREFIX}{"i": 0, "result": "unparsed", "detail": "SympifyError"}\n`
  const { result, warnings } = parseRunResult(pairs, code, ran(code, output))
  assert.deepEqual(result.checks.map((c) => [c.result, c.detail]), [
    ['unparsed', 'SympifyError'],
    ['unparsed', null],
  ])
  assert.equal(warnings.length, 1)
})

test('出力: 同じ組の行が2行以上あれば，先の行が same でも unparsed にする', () => {
  const code = buildSympyCode(pairs)
  const output = out([
    { i: 0, result: 'same', detail: null },
    { i: 0, result: 'not_confirmed', detail: '2' },
    { i: 1, result: 'same', detail: null },
  ])
  const { result, warnings } = parseRunResult(pairs, code, ran(code, output))
  assert.deepEqual(result.checks.map((c) => c.result), ['unparsed', 'same'])
  assert.match(warnings[0], /2行以上/)
})

test('契約: 空なら code は null．順番・same の detail を確かめる', () => {
  assert.deepEqual(validateMathChecks({ schemaVersion: '0.1.0', checks: [], code: null }, ids), [])
  assert.equal(validateMathChecks({ schemaVersion: '0.1.0', checks: [], code: 'x' }, ids).length, 1)
  const c = (stepId: string, result = 'same', detail: string | null = null) => ({ stepId, before: 'x', after: 'x', result, detail })
  const errors = validateMathChecks({ schemaVersion: '0.1.0', checks: [c('s2'), c('s1'), c('s1', 'same', 'x'), c('s3')], code: 'x' }, ids)
  assert.equal(errors.length, 4) // 順番が2つ（s1 が2回 s2 より後），same の detail，s3 が無い
})
