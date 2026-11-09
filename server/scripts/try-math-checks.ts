// 式変形の確認を，契約のサンプルで Gemini に1回投げて結果を出す．
// docs/decisions/issue-22-sympy-check.md の出力例を作るためのもの．デプロイには含まれない（lib/ に入らない）
// 使い方（server/ で．ADC が要る: gcloud auth application-default login）:
//   GOOGLE_CLOUD_PROJECT=<プロジェクト ID> node scripts/try-math-checks.ts [サンプルのファイル名（既定は algebra.sample.json）]
import { readFileSync } from 'node:fs'
import { GoogleGenAI } from '@google/genai'
import type { ThoughtSteps } from '../src/contract.ts'
import {
  assertMathChecks,
  buildPairsPrompt,
  buildRunParts,
  buildSympyCode,
  normalizePairs,
  pairsResponseSchema,
  parseRunResult,
} from '../src/mathChecks.ts'

const name = process.argv[2] ?? 'algebra.sample.json'
const steps = JSON.parse(
  readFileSync(new URL(`../../shared/schema/examples/${name}`, import.meta.url), 'utf8'),
) as ThoughtSteps
const problem = name.startsWith('algebra')
  ? { title: '式の計算', body: '(x+1)^2 - (x-1)^2 を簡単にせよ．' }
  : { title: '素数は無限にある', body: '素数が無限に存在することを証明せよ．' }
const stepIds = steps.steps.map((s) => s.id)

const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
})
const res = await ai.models.generateContent({
  model,
  contents: [{ role: 'user', parts: [{ text: buildPairsPrompt(problem, steps) }] }],
  config: { responseMimeType: 'application/json', responseJsonSchema: pairsResponseSchema(stepIds), temperature: 0 },
})
const { pairs, warnings } = normalizePairs(stepIds, JSON.parse(res.text ?? ''))
console.log(JSON.stringify({ model, rawPairs: JSON.parse(res.text ?? ''), pairs, warnings }, null, 2))
if (pairs.length) {
  const code = buildSympyCode(pairs)
  const run = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: buildRunParts(code) }],
    config: { tools: [{ codeExecution: {} }], temperature: 0 },
  })
  const parts = run.candidates?.[0]?.content?.parts ?? []
  const parsed = parseRunResult(pairs, code, parts)
  assertMathChecks(parsed.result, stepIds)
  console.log(JSON.stringify({ parts, result: parsed.result, warnings: parsed.warnings }, null, 2))
}
