// 投稿 → Gemini への入力，Gemini の返り値 → 契約に合う思考ステップ．
// 動画は PoC #7（PR #34 の poc/7-video-steps/src/video-to-steps.ts・modes.ts．11/6 に書いたもの）から移した．画像・テキストは同じ方針で足した
import type { Part } from '@google/genai'
import { validateThoughtSteps, type PostKind, type Step, type ThoughtSteps } from './contract.ts'
import { findQuote } from './quoteMatch.ts'
import { UnreadableError } from './stepsError.ts'

// Firestore の投稿（docs/decisions/008-post-upload.md）
export type Post =
  | { kind: 'image'; imagePaths: string[] }
  | { kind: 'text'; text: string }
  | { kind: 'video'; videoPath: string; durationSec: number }

// 動画は先頭のこの秒数までを Gemini に渡す．durationSec はブラウザが書く値で，長い動画でも費用が膨らまないようにする
// （web/src/posts.ts の videoMaxSec・firestore.rules と揃える）
export const VIDEO_MAX_SEC = 60

// 設計原則: AI は答えや理由を代わりに書かない．正誤を判定しない
const COMMON_RULES = `守ること:
- ステップは考えた（説明した）順に並べる．挨拶・締めの言葉など，解き方と関係ない部分はステップにしない
- transcript は，その場所に書かれている式・文，または話している言葉の書き起こし．言い換えたり要約したりしない
- what は「何をしたか」を短く整理する．正しい・誤っている・うまい，などの評価は書かない
- 理由（なぜそうしたか）は，本人が自分の言葉で書いている・言っているときだけ，その部分を transcript からそのまま抜き出して why.text にし，why.by を "post_quote" にする．why.text は transcript の一部を1文字も変えずに写す（$ や \\sqrt{2} などの数式の書き方，記号，句読点も transcript と同じにする．√2 のように書き換えない）．書いていなければ why は null にする．あなたが理由を推測・補足して書いてはいけない
- 解き方が正しいかどうかは判断しない
- id は s1, s2, … と順に振る`

const PROMPTS: Record<PostKind, string> = {
  video: `あなたは学習プラットフォームの「整理役」です．添付の動画は，学生が問題の解き方を説明している動画です．
説明を「思考ステップ」の列に分けてください．
- source.startSec / source.endSec は，そのステップを話し始めた時刻と話し終えた時刻（動画の先頭からの秒）．ステップ同士はなるべく隙間なく続ける
${COMMON_RULES}`,
  image: `あなたは学習プラットフォームの「整理役」です．添付の画像は，学生が問題を解いた手書きのノートです（複数枚のときは順に続いています）．
解き方を「思考ステップ」の列に分けてください．
- source.imageIndex は，そのステップが書かれている画像の番号（各画像の直前に書いた番号．0 始まり）
- source.box2d は，その画像の中でステップが書かれている範囲 [ymin, xmin, ymax, xmax]（画像の幅・高さを 1000 とした整数）
${COMMON_RULES}`,
  text: `あなたは学習プラットフォームの「整理役」です．下の本文は，学生が問題の解き方を LaTeX などで書いたものです．各行の先頭に「行番号|」を付けてあります（行番号は本文の一部ではありません）．
解き方を「思考ステップ」の列に分けてください．
- source.lineStart / source.lineEnd は，そのステップが書かれている最初と最後の行番号（lineEnd の行を含む）
- transcript には行番号を含めない
${COMMON_RULES}`,
}

/** Gemini に渡す parts．files は Storage のパス → { gs:// の URI, MIME タイプ } */
export function buildParts(post: Post, files: Map<string, { uri: string; mimeType: string }>): Part[] {
  const file = (path: string): Part => {
    const f = files.get(path)
    if (!f) throw new Error(`ファイルの情報がない: ${path}`)
    return { fileData: { fileUri: f.uri, mimeType: f.mimeType } }
  }
  if (post.kind === 'video')
    return [{ ...file(post.videoPath), videoMetadata: { endOffset: `${VIDEO_MAX_SEC}s` } }, { text: PROMPTS.video }]
  if (post.kind === 'image')
    return [
      ...post.imagePaths.flatMap((path, i): Part[] => [{ text: `画像 ${i}` }, file(path)]),
      { text: PROMPTS.image },
    ]
  const numbered = splitLines(post.text)
    .map((line, i) => `${i + 1}|${line}`)
    .join('\n')
  return [{ text: `${PROMPTS.text}\n\n本文:\n${numbered}` }]
}

/** 契約の textSource の行番号と同じ数え方（改行で分ける．CRLF も1つの改行） */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/)
}

export type Normalized = { result: ThoughtSteps; warnings: string[] }

/**
 * Gemini の返り値を契約に合う形に直す．スキーマで表せない決まり（shared/schema/README.md）も確かめ，
 * 直せないステップは捨てて warnings に残す．1つも返ってこなければ UnreadableError，全部捨てたら Error
 */
export function normalizeSteps(post: Post, raw: unknown): Normalized {
  const warnings: string[] = []
  const rawSteps = (raw as { steps?: unknown })?.steps
  if (!Array.isArray(rawSteps)) throw new Error('Gemini の返り値に steps の配列がない')
  // ステップが1つも返ってこなかったときだけ「読み取れなかった」として画面に分けて出す（issue-73）．
  // 返ってきたのに全部捨てたときは，読めていて返し方がずれているだけのこともあるので，下の「契約に合わない」（unknown）にする
  if (rawSteps.length === 0) throw new UnreadableError('返り値の steps が空')

  const steps: Step[] = []
  rawSteps.forEach((s: Step, i) => {
    const label = `${i + 1}番目`
    if (s?.source?.kind !== post.kind) return void warnings.push(`${label}: source.kind が ${s?.source?.kind} なので捨てた`)
    if (typeof s.what !== 'string' || s.what.length === 0) return void warnings.push(`${label}: what が空なので捨てた`)
    // 範囲や大小がおかしいステップは，投稿全体を失敗にせず，そのステップだけを捨てる（README「満たさないステップは捨てる」）
    const checked = checkSource(post, s.source, warnings, label)
    if (typeof checked === 'string') return void warnings.push(`${label}: ${checked}ので捨てた`)
    const src = checked

    let transcript = typeof s.transcript === 'string' ? s.transcript : undefined
    if (src.kind === 'text' && post.kind === 'text') {
      // テキストは原本が手元にあるので，transcript は Gemini の書き起こしではなく本文の行をそのまま使う．
      // Gemini が返す transcript では LaTeX のバックスラッシュが崩れた（\le → 改行+e など）
      transcript = splitLines(post.text).slice(src.lineStart - 1, src.lineEnd).join('\n')
    }

    let why = s.why ?? null
    if (why !== null && !(typeof why.text === 'string' && why.text.length > 0)) {
      warnings.push(`${label}: why.text が空なので null にした`)
      why = null
    }
    // AI が「本人がアプリで書いた」と名乗るのは原則違反なので落とす
    if (why?.by === 'author') {
      warnings.push(`${label}: AI が why.by="author" を返したので null にした`)
      why = null
    }
    // why は引用だけ，という原則を機械的に確かめる（契約: transcript にそのまま含まれる）．
    // transcript も AI の書き起こしなので完全な保証ではなく，本人の承認は UI で行う
    if (why) {
      // $・空白・句読点・\sqrt{2} と √2 などの書き方の違いだけはそろえて照合し，通れば transcript の該当部分に置き換える（#51）．
      // 言葉が違う（言い換え・補足）ものは通さない
      const quote = transcript === undefined ? null : findQuote(transcript, why.text)
      if (quote === null) {
        warnings.push(`${label}: why が transcript にそのまま含まれていないので null にした`)
        why = null
      } else if (quote !== why.text) {
        warnings.push(`${label}: why の書き方を transcript にそろえた（${why.text} → ${quote}）`)
        why = { ...why, text: quote }
      }
    }

    const step: Step = { id: '', what: s.what, why: why && { text: why.text, by: 'post_quote' }, source: src }
    if (transcript !== undefined) step.transcript = transcript
    steps.push(step)
  })

  // id は返り値ではなくコードで振り直す（PoC #7 の申し送り）
  steps.forEach((s, i) => (s.id = `s${i + 1}`))
  const result: ThoughtSteps = { schemaVersion: '0.1.0', steps }
  if (steps.length === 0) throw new Error(`ステップを全部捨てた: ${warnings.join(' / ')}`)
  const errors = validateThoughtSteps(result)
  // 全部捨てたときに理由がログに残るよう，warnings も例外に含める
  if (errors.length) throw new Error(`契約に合わない: ${[...errors, ...warnings].join(' / ')}`)
  return { result, warnings }
}

const isInt = (n: unknown): n is number => Number.isInteger(n)
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * ステップの元の場所を確かめ，直せるもの（上限を超えた終わり）は切り詰めて，新しく作った source を返す．
 * 直せなければ捨てる理由を返す
 */
function checkSource(post: Post, src: Step['source'], warnings: string[], label: string): Step['source'] | string {
  if (src.kind === 'video' && post.kind === 'video') {
    const { startSec, endSec } = src
    if (!isNum(startSec) || !isNum(endSec) || startSec < 0) return `時刻 (${startSec}〜${endSec}) が読めない`
    if (endSec < startSec) return `終わり (${endSec}) が始まり (${startSec}) より前な`
    // 処理するのは先頭の 60 秒まで（buildParts の endOffset）．#7 で動画の長さを超える endSec が返った例もある
    const limit = Math.min(post.durationSec, VIDEO_MAX_SEC)
    if (!(startSec < limit)) return `始まり (${startSec}) が動画の長さ (${limit}) を超える`
    if (endSec > limit) warnings.push(`${label}: endSec (${endSec}) を ${limit} に切り詰めた`)
    return { kind: 'video', startSec, endSec: Math.min(endSec, limit) }
  }
  if (src.kind === 'image' && post.kind === 'image') {
    const { imageIndex, box2d: b } = src
    if (!isInt(imageIndex) || imageIndex < 0 || imageIndex >= post.imagePaths.length)
      return `imageIndex (${imageIndex}) の画像がない`
    if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => isInt(n) && n >= 0 && n <= 1000))
      return 'box2d が 0〜1000 の整数4つでない'
    if (b[0] > b[2] || b[1] > b[3]) return 'box2d の min と max が逆な'
    return { kind: 'image', imageIndex, box2d: [b[0], b[1], b[2], b[3]] }
  }
  if (src.kind === 'text' && post.kind === 'text') {
    const { lineStart, lineEnd } = src
    const lines = splitLines(post.text).length
    if (!isInt(lineStart) || !isInt(lineEnd) || lineStart < 1) return `行番号 (${lineStart}〜${lineEnd}) が 1 以上の整数でない`
    if (lineEnd < lineStart) return `lineEnd (${lineEnd}) が lineStart (${lineStart}) より前な`
    if (lineStart > lines) return `lineStart (${lineStart}) の行がない`
    if (lineEnd > lines) warnings.push(`${label}: lineEnd (${lineEnd}) を本文の行数 (${lines}) に切り詰めた`)
    return { kind: 'text', lineStart, lineEnd: Math.min(lineEnd, lines) }
  }
  return `source.kind が ${src.kind} な`
}
