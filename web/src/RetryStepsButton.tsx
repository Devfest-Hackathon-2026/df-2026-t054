import { useState } from 'react'

// 「もう一度ステップに分ける」．ファイルを上げ直さずに，今の投稿のままステップ化をやり直す
// （docs/decisions/issue-73-steps-error-reason.md）．onRetry は posts.ts の retrySteps
function RetryStepsButton({ onRetry }: { onRetry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const retry = () => {
    setError(null)
    setBusy(true)
    onRetry()
      .catch((err: unknown) => setError(`やり直せませんでした: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => setBusy(false))
  }

  return (
    <>
      <button type="button" disabled={busy} onClick={retry}>
        もう一度ステップに分ける
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  )
}

export default RetryStepsButton
