// ステップ化に失敗した理由の分類と，一時的なエラーのやり直しのテスト．`npm test`（Node 標準の node:test）
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '@google/genai'
import { normalizeSteps, type Post } from '../src/steps.ts'
import { classifyStepsError, retryOnceIfTemporary, UnreadableError } from '../src/stepsError.ts'

const image: Post = { kind: 'image', imagePaths: ['problems/p/posts/u/a.jpg'] }
const throwOf = (fn: () => unknown): unknown => {
  try {
    fn()
  } catch (err) {
    return err
  }
  assert.fail('例外が出なかった')
}

test('読み取れなかった: steps が空', () => {
  assert.equal(classifyStepsError(throwOf(() => normalizeSteps(image, { steps: [] }))), 'unreadable')
})

test('全部捨てたときは読み取れなかったにしない（読めていて返し方がずれているだけのこともある）．理由はメッセージに残る', () => {
  const err = throwOf(() =>
    normalizeSteps(image, {
      steps: [
        { id: 's1', what: '式を立てた', why: null, source: { kind: 'text', lineStart: 1, lineEnd: 1 } },
        { id: 's2', what: '', why: null, source: { kind: 'image', imageIndex: 0, box2d: [0, 0, 10, 10] } },
      ],
    }),
  )
  assert.ok(err instanceof Error && !(err instanceof UnreadableError))
  assert.equal(classifyStepsError(err), 'unknown')
  assert.match(err.message, /source\.kind/)
  assert.match(err.message, /what が空/)
})

test('1つでも残れば失敗にしない', () => {
  const { result } = normalizeSteps(image, {
    steps: [{ id: 's1', what: '式を立てた', why: null, source: { kind: 'image', imageIndex: 0, box2d: [0, 0, 10, 10] } }],
  })
  assert.equal(result.steps.length, 1)
})

test('一時的なエラー: Vertex AI の 429・5xx・408', () => {
  for (const status of [408, 429, 500, 503, 504])
    assert.equal(classifyStepsError(new ApiError({ message: 'x', status })), 'temporary', `${status}`)
})

test('一時的なエラー: 時間切れ・つながらない（cause の中も見る）', () => {
  assert.equal(classifyStepsError(new DOMException('aborted', 'AbortError')), 'temporary')
  assert.equal(classifyStepsError(new DOMException('timeout', 'TimeoutError')), 'temporary')
  const cause = Object.assign(new Error('connect'), { code: 'ECONNRESET' })
  assert.equal(classifyStepsError(new TypeError('fetch failed', { cause })), 'temporary')
})

test('それ以外: 400・403・JSON が壊れている・steps の配列がない', () => {
  assert.equal(classifyStepsError(new ApiError({ message: 'bad', status: 400 })), 'unknown')
  assert.equal(classifyStepsError(new ApiError({ message: 'denied', status: 403 })), 'unknown')
  assert.equal(classifyStepsError(throwOf(() => JSON.parse(''))), 'unknown')
  assert.equal(classifyStepsError(throwOf(() => normalizeSteps(image, {}))), 'unknown')
  assert.equal(classifyStepsError('文字列'), 'unknown')
})

test('やり直し: 一時的なエラーなら1回だけやり直す', async () => {
  let calls = 0
  const retried: unknown[] = []
  const result = await retryOnceIfTemporary(
    async () => {
      calls++
      if (calls === 1) throw new ApiError({ message: 'busy', status: 429 })
      return 'ok'
    },
    { waitMs: 0, onRetry: (err) => retried.push(err) },
  )
  assert.equal(result, 'ok')
  assert.equal(calls, 2)
  assert.equal(retried.length, 1)
})

test('やり直し: 2回目も失敗したらその例外を出す（3回目はしない）', async () => {
  let calls = 0
  await assert.rejects(
    retryOnceIfTemporary(
      async () => {
        calls++
        throw new ApiError({ message: `busy ${calls}`, status: 503 })
      },
      { waitMs: 0 },
    ),
    /busy 2/,
  )
  assert.equal(calls, 2)
})

test('やり直し: 一時的でないエラーはやり直さない', async () => {
  let calls = 0
  await assert.rejects(
    retryOnceIfTemporary(
      async () => {
        calls++
        throw new UnreadableError('空')
      },
      { waitMs: 0 },
    ),
    UnreadableError,
  )
  assert.equal(calls, 1)
})
