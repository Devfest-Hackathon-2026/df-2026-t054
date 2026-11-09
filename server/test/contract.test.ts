// Gemini に渡すスキーマ（geminiSchema）のテスト．`npm test`（Node 標準の node:test．依存は足さない）
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { geminiSchema, type PostKind } from '../src/contract.ts'

const contract = (): unknown =>
  JSON.parse(readFileSync(new URL('../../shared/schema/thought-steps.schema.json', import.meta.url), 'utf8'))

/** スキーマの中にあるキー名 key をすべて集める */
function collect(v: unknown, key: string, found: unknown[] = []): unknown[] {
  if (Array.isArray(v)) v.forEach((x) => collect(x, key, found))
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      if (k === key) found.push(x)
      collect(x, key, found)
    }
  return found
}

for (const kind of ['image', 'text', 'video'] as PostKind[]) {
  test(`${kind}: const が残らず，source.kind は値1つの enum になる`, () => {
    const s = geminiSchema(contract(), kind) as { $defs: Record<string, any> }
    assert.deepEqual(collect(s, 'const'), [])
    assert.deepEqual(s.$defs[`${kind}Source`].properties.kind, { type: 'string', enum: [kind] })
    assert.deepEqual(s.$defs.step.properties.source.anyOf, [{ $ref: `#/$defs/${kind}Source` }])
    // ほかの種類の定義は残さない
    assert.deepEqual(
      Object.keys(s.$defs).filter((k) => k.endsWith('Source')),
      [`${kind}Source`],
    )
  })
}

test('契約のスキーマ（引数）は書き換えない', () => {
  const c = contract()
  const before = JSON.stringify(c)
  geminiSchema(c, 'image')
  assert.equal(JSON.stringify(c), before)
})

test('const という名前のプロパティや enum の値はキーワードとして扱わない', () => {
  const c = contract() as { $defs: Record<string, any> }
  c.$defs.step.properties.const = { type: 'string', enum: ['const'] }
  const s = geminiSchema(c, 'text') as { $defs: Record<string, any> }
  assert.deepEqual(s.$defs.step.properties.const, { type: 'string', enum: ['const'] })
})
