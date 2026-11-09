// 問いかけのプロンプトを，契約のサンプル（image と video の素数の証明）で Gemini に1回投げて結果を出す．
// docs/decisions/015-ai-questions.md の出力例を作るためのもの．デプロイには含まれない（lib/ に入らない）
// 使い方（server/ で．ADC が要る: gcloud auth application-default login）:
//   GOOGLE_CLOUD_PROJECT=<プロジェクト ID> node scripts/try-questions.ts
import { readFileSync } from 'node:fs'
import { GoogleGenAI } from '@google/genai'
import type { StepAlignment, ThoughtSteps } from '../src/contract.ts'
import { buildQuestionsPrompt, normalizeQuestions, questionsResponseSchema, questionTargets } from '../src/questions.ts'

const sample = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../shared/schema/examples/${name}`, import.meta.url), 'utf8'))
const a = sample('image.sample.json') as ThoughtSteps
const b = sample('video.sample.json') as ThoughtSteps
const alignment = sample('alignment.image-video.sample.json') as StepAlignment
const problem = { title: '素数は無限にある', body: '素数が無限に存在することを証明せよ．' }

const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
const ai = new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.GOOGLE_CLOUD_LOCATION || 'global' })
const targets = questionTargets(alignment, a, b)
const res = await ai.models.generateContent({
  model,
  contents: [{ role: 'user', parts: [{ text: buildQuestionsPrompt(problem, a, b, alignment, targets) }] }],
  config: { responseMimeType: 'application/json', responseJsonSchema: questionsResponseSchema(targets), temperature: 0 },
})
const ids = (t: ThoughtSteps) => t.steps.map((s) => s.id)
const { result, warnings } = normalizeQuestions(targets, ids(a), ids(b), JSON.parse(res.text ?? ''))
console.log(JSON.stringify({ model, raw: JSON.parse(res.text ?? ''), result, warnings }, null, 2))
