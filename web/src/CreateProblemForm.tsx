import { useState, type FormEvent } from 'react'
import { createProblem, problemBodyMax, problemPath, problemTitleMax } from './problems.ts'
import { navigate } from './useRoute.ts'

function CreateProblemForm({ uid }: { uid: string }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    createProblem(uid, title.trim(), body.trim())
      .then((id) => navigate(problemPath(id)))
      .catch((err: unknown) => {
        setError(`問題を作れませんでした: ${err instanceof Error ? err.message : String(err)}`)
        setBusy(false)
      })
  }

  return (
    <form onSubmit={onSubmit}>
      <h2>問題を作る</h2>
      <p>
        <label>
          タイトル
          <br />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={problemTitleMax}
            required
            size={40}
          />
        </label>
      </p>
      <p>
        <label>
          本文
          <br />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={problemBodyMax}
            required
            rows={6}
            cols={60}
          />
        </label>
      </p>
      <button type="submit" disabled={busy || !title.trim() || !body.trim()}>
        作成する
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}

export default CreateProblemForm
