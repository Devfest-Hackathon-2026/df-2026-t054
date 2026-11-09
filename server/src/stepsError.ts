// ステップ化に失敗した理由の分類と，一時的なエラーのやり直し（docs/decisions/issue-73-steps-error-reason.md）．
// 設計原則: 理由は「読み取れたか」だけ．解き方の正誤・出来を判定する分類にしない

export type StepsErrorCode = 'unreadable' | 'temporary' | 'unknown'

/** Gemini がステップを1つも返さなかった（解き方の手順を読み取れなかった） */
export class UnreadableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnreadableError'
  }
}

// 画面に出す見出し（steps/{uid}.error）．どうすればよいかは画面（web/src/StepsStatus.tsx）が errorCode から出す
export const STEPS_ERROR_MESSAGES: Record<StepsErrorCode, string> = {
  unreadable: '投稿から解き方の手順を読み取れませんでした．',
  temporary: 'AI の処理が一時的にうまくいかず，ステップに分けられませんでした．',
  unknown: 'ステップに分けられませんでした．時間をおいて，もう一度ステップに分けるか出し直してください．',
}

// Vertex AI の 429（混み合い）・408 / 5xx．@google/genai の ApiError は status を持つ
const isTemporaryStatus = (status: unknown) =>
  typeof status === 'number' && (status === 408 || status === 429 || (status >= 500 && status <= 599))

// 時間切れ（httpOptions.timeout で中断）・つながらなかった
const TEMPORARY_NAMES = new Set(['AbortError', 'TimeoutError'])
const TEMPORARY_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
])

/** 一時的なエラー（もう一度試せば通るかもしれない）か．fetch の失敗は cause に元のエラーが入るので，たどって見る */
export function isTemporaryError(err: unknown): boolean {
  for (let e = err, depth = 0; e && typeof e === 'object' && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    const { status, name, code } = e as { status?: unknown; name?: unknown; code?: unknown }
    if (isTemporaryStatus(status)) return true
    if (typeof name === 'string' && TEMPORARY_NAMES.has(name)) return true
    if (typeof code === 'string' && TEMPORARY_CODES.has(code)) return true
  }
  return false
}

export function classifyStepsError(err: unknown): StepsErrorCode {
  if (err instanceof UnreadableError) return 'unreadable'
  if (isTemporaryError(err)) return 'temporary'
  return 'unknown'
}

/** 一時的なエラーのときだけ，waitMs 待って1回だけやり直す．onRetry はログ用 */
export async function retryOnceIfTemporary<T>(
  fn: () => Promise<T>,
  { waitMs, onRetry }: { waitMs: number; onRetry?: (err: unknown) => void },
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (!isTemporaryError(err)) throw err
    onRetry?.(err)
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    return fn()
  }
}
