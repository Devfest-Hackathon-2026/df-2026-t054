// why（本人の言葉の引用）が transcript のどこにあたるかを，書き方の違いだけを無視して探す（#51）．
// #9 で，Gemini は transcript を `$\leftarrow \sqrt{2}$ も分数も…` と書き，why を `√2も分数も…` と書くなど，
// 同じ文を別の書き方で引用して「そのまま含まれる」の照合に落ちた．
// そろえるのは表記（$・波括弧・空白・句読点・全角半角・LaTeX のコマンドと記号）だけ．言葉が1文字でも違えば通さない（設計原則: AI が言い換えた・補った理由は通さない）

// LaTeX のコマンド → 同じ意味の記号．ここに無いコマンドは名前のまま残す（`\frac` と `\frac` は一致するが，記号とは一致しない）
const LATEX_SYMBOLS: Record<string, string> = {
  sqrt: '√',
  leftarrow: '←',
  gets: '←',
  rightarrow: '→',
  to: '→',
  Leftarrow: '⇐',
  Rightarrow: '⇒',
  implies: '⇒',
  Leftrightarrow: '⇔',
  iff: '⇔',
  times: '×',
  cdot: '·',
  div: '÷',
  pm: '±',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  ne: '≠',
  neq: '≠',
  infty: '∞',
  in: '∈',
  therefore: '∴',
  because: '∵',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  theta: 'θ',
  pi: 'π',
}
// 見た目を整えるだけで意味を持たないコマンド
const LATEX_IGNORED = new Set(['left', 'right', 'quad', 'qquad'])

// 照合では無視する文字．数式の区切り（$ と波括弧），空白，文の区切り・引用の括弧
const IGNORED = /[\s${}。．.、，,・！!？?「」『』]/u

type Char = { ch: string; start: number; end: number }

/** 照合用にそろえた文字の列．各文字に，元の文字列での範囲 [start, end) を持たせる */
function normalize(s: string): Char[] {
  const out: Char[] = []
  const push = (text: string, start: number, end: number) => {
    for (const ch of text.normalize('NFKC')) if (!IGNORED.test(ch)) out.push({ ch, start, end })
  }
  let i = 0
  while (i < s.length) {
    if (s[i] === '\\') {
      const m = /^\\([A-Za-z]+|.)?/s.exec(s.slice(i))!
      const name = m[1] ?? ''
      const end = i + m[0].length
      if (/^[A-Za-z]+$/.test(name)) {
        if (name in LATEX_SYMBOLS) push(LATEX_SYMBOLS[name], i, end)
        else if (!LATEX_IGNORED.has(name)) push(m[0], i, end)
      } else if (name === '\\') {
        // `\\`（改行）は無視する
      } else if (!/^[,;:! ]$/.test(name)) {
        // `\{` `\%` などは記号そのもの．`\,` `\;` `\ ` などの空白は無視する
        push(name, i, end)
      }
      i = end
      continue
    }
    const cp = String.fromCodePoint(s.codePointAt(i)!)
    push(cp, i, i + cp.length)
    i += cp.length
  }
  return out
}

/**
 * quote が transcript に，書き方の違いを除いてそのまま含まれていれば，transcript の該当部分（元の書き方のまま）を返す．
 * 含まれていなければ null．そろえたあとで2文字未満の quote（句読点だけなど）は照合しない
 */
export function findQuote(transcript: string, quote: string): string | null {
  const q = normalize(quote)
  if (q.length < 2) return null
  if (transcript.includes(quote)) return quote
  const t = normalize(transcript)
  // 文字列にして indexOf すると，サロゲートペアの文字で配列の位置とずれるので，配列のまま探す
  for (let at = 0; at + q.length <= t.length; at++) {
    if (q.every((c, k) => t[at + k].ch === c.ch)) return widenToMath(transcript, t[at].start, t[at + q.length - 1].end)
  }
  return null
}

/**
 * 切り出す範囲の端が $…$ の数式の途中にあれば，その数式の $ まで広げる（PR #86 のレビュー）．
 * 広げないと `\sqrt{2}$ も…` のように $ が片方だけ残る．広げた分も transcript の文字なので，引用だけという原則は変わらない
 */
function widenToMath(transcript: string, start: number, end: number): string {
  // `\$`（記号としてのドル）は数式の区切りではないので数えない
  const dollars = [...transcript.matchAll(/(?<!\\)\$/g)].map((m) => m.index)
  const before = dollars.filter((i) => i < start)
  // 前にある $ が奇数個なら，start は数式の中．直前の $ から始める
  if (before.length % 2 === 1) start = before[before.length - 1]
  // end までにある $ が奇数個なら，end は数式の中．次の $ まで含める
  const upToEnd = dollars.filter((i) => i < end)
  if (upToEnd.length % 2 === 1) {
    const next = dollars.find((i) => i >= end)
    if (next !== undefined) end = next + 1
  }
  return transcript.slice(start, end)
}
