// 投稿の種類ごとのモデルの決め方のテスト．`npm test`（Node 標準の node:test）
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { baseModel, DEFAULT_MODEL, stepsModel } from '../src/models.ts'

test('何も設定しないと，画像だけ gemini-3.8-flash', () => {
  assert.equal(stepsModel('image', {}), 'gemini-3.8-flash')
  assert.equal(stepsModel('video', {}), DEFAULT_MODEL)
  assert.equal(stepsModel('text', {}), DEFAULT_MODEL)
  assert.equal(baseModel({}), DEFAULT_MODEL)
})

test('空の値は設定していないのと同じ', () => {
  const env = { GEMINI_MODEL: '', GEMINI_MODEL_IMAGE: '' }
  assert.equal(stepsModel('image', env), 'gemini-3.8-flash')
  assert.equal(baseModel(env), DEFAULT_MODEL)
})

test('GEMINI_MODEL は種類ごとの値が空のときに全種類で使われる', () => {
  const env = { GEMINI_MODEL: 'gemini-3.5-flash' }
  assert.equal(stepsModel('image', env), 'gemini-3.5-flash')
  assert.equal(stepsModel('video', env), 'gemini-3.5-flash')
  assert.equal(baseModel(env), 'gemini-3.5-flash')
})

test('種類ごとの値がいちばん強く，その種類だけに効く', () => {
  const env = { GEMINI_MODEL: 'gemini-3.1-flash-lite', GEMINI_MODEL_IMAGE: 'gemini-3.5-flash' }
  assert.equal(stepsModel('image', env), 'gemini-3.5-flash')
  assert.equal(stepsModel('text', env), 'gemini-3.1-flash-lite')
  assert.equal(stepsModel('text', { GEMINI_MODEL_TEXT: 'x' }), 'x')
  assert.equal(stepsModel('video', { GEMINI_MODEL_VIDEO: 'y' }), 'y')
  assert.equal(baseModel(env), 'gemini-3.1-flash-lite')
})
