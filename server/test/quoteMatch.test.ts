// why の引用を transcript と照合するテスト（#51）．`npm test`
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findQuote } from '../src/quoteMatch.ts'
import { normalizeSteps, type Post } from '../src/steps.ts'

// #9 で照合に落ちた例（gemini-3.5-flash・gemini-3.8-flash，本番のプロンプト，手書き 2 枚）
const memo = '$\\leftarrow \\sqrt{2}$ も分数も消して整数だけにしたい'

test('そのまま含まれていれば，そのまま返す', () => {
  assert.equal(findQuote(memo, '分数も消して'), '分数も消して')
})

test('#9 で落ちた書き方の違い: \\sqrt{2} と √2・$・空白', () => {
  // 照合した範囲の端が $…$ の途中なら，その数式の $ まで広げる（$ が片方だけ残らないように．PR #86 のレビュー）
  assert.equal(findQuote(memo, '\\sqrt{2}も分数も消して整数だけにしたい'), memo)
  assert.equal(findQuote(memo, '√2も分数も消して整数だけにしたい'), memo)
  assert.equal(findQuote(memo, '← √2 も分数も消して整数だけにしたい'), memo)
})

test('切り出した範囲の $ がそろう: 終わりが数式の途中なら次の $ まで広げる．数式の外は広げない', () => {
  assert.equal(findQuote('ここで $a \\le b$ を使うと楽だから', 'ここでa'), 'ここで $a \\le b$')
  assert.equal(findQuote('$x$ とおく．計算が楽になるから。', '計算が楽になるから'), '計算が楽になるから')
  // `\$`（記号のドル）は数式の区切りとして数えない
  assert.equal(findQuote('\\$5 で $x$ 個買えるから', '5で'), '5 で')
})

test('#9 で落ちた文の終わりの違い（。の有無）', () => {
  assert.equal(findQuote('背理法を使う．直接示すのは難しいから', '直接示すのは難しいから。'), '直接示すのは難しいから')
  assert.equal(findQuote('直接示すのは難しいから。', '直接示すのは難しいから'), '直接示すのは難しいから')
})

test('全角と半角・句読点の種類の違い', () => {
  assert.equal(findQuote('ｐ，ｑ は互いに素なので、約分できない', 'p,qは互いに素なので，約分できない'), 'ｐ，ｑ は互いに素なので、約分できない')
})

test('言葉が違うもの（言い換え・補足・要約）は通さない', () => {
  // 言い換え
  assert.equal(findQuote(memo, '√2と分数を消して整数だけにしたい'), null)
  // 理由を補った
  assert.equal(findQuote(memo, '√2も分数も消して整数だけにしたいから'), null)
  // 読み違え（#8 で「根号も消して…」と読み違えた例）
  assert.equal(findQuote(memo, '根号も分数も消して整数だけにしたい'), null)
  // 間を飛ばした
  assert.equal(findQuote(memo, '√2も整数だけにしたい'), null)
})

test('式の中身が違えば通さない', () => {
  assert.equal(findQuote('$\\sqrt{2}$ は無理数', '√3は無理数'), null)
  assert.equal(findQuote('$a \\le b$ なので', 'a<bなので'), null)
})

test('そろえたあとに2文字未満になる引用（句読点だけなど）は通さない', () => {
  assert.equal(findQuote('よって。', '。'), null)
  assert.equal(findQuote('x = 1 とおく', '$x$'), null)
})

const image: Post = { kind: 'image', imagePaths: ['problems/p/posts/u/a.jpg'] }
const source = { kind: 'image', imageIndex: 0, box2d: [0, 0, 10, 10] }

test('normalizeSteps: 書き方だけ違う why は transcript の該当部分に置き換えて残す（契約の「そのまま含まれる」を保つ）', () => {
  const { result, warnings } = normalizeSteps(image, {
    steps: [{ what: '方針を決めた', why: { text: '√2も分数も消して整数だけにしたい', by: 'post_quote' }, transcript: memo, source }],
  })
  const why = result.steps[0].why
  assert.equal(why?.text, memo)
  assert.equal(why?.by, 'post_quote')
  assert.ok(result.steps[0].transcript?.includes(why.text))
  assert.match(warnings.join(), /書き方を transcript にそろえた/)
})

test('normalizeSteps: 言い換えた why は今までどおり null にする', () => {
  const { result, warnings } = normalizeSteps(image, {
    steps: [{ what: '方針を決めた', why: { text: '√2を消すため', by: 'post_quote' }, transcript: memo, source }],
  })
  assert.equal(result.steps[0].why, null)
  assert.match(warnings.join(), /そのまま含まれていない/)
})
