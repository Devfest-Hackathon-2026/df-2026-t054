import { useState, type FormEvent } from 'react'
import { threadTextMaxLength } from './threads.ts'

// 質問・返信を書く欄．onSubmit が成功したら欄を空にする．onCancel を渡すと「やめる」を出す
function ThreadTextForm({
  label,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  label: string
  submitLabel: string
  onSubmit: (text: string) => Promise<unknown>
  onCancel?: () => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmed = text.trim()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    onSubmit(trimmed).then(
      () => {
        setText('')
        setSending(false)
      },
      (err: Error) => {
        setError(err.message)
        setSending(false)
      },
    )
  }

  return (
    <form onSubmit={submit}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={threadTextMaxLength}
        rows={2}
        cols={50}
        aria-label={label}
        placeholder={label}
      />{' '}
      <button type="submit" disabled={!trimmed || sending}>
        {sending ? '送っています…' : submitLabel}
      </button>
      {onCancel && (
        <>
          {' '}
          <button type="button" onClick={onCancel} disabled={sending}>
            やめる
          </button>
        </>
      )}
      {error && <p role="alert">書き込めませんでした: {error}</p>}
    </form>
  )
}

export default ThreadTextForm
