import { useState } from 'react'
import { isAllSubmitted, joinProblem, problemPath, type Problem } from './problems.ts'
import { navigate } from './useRoute.ts'

function JoinProblem({ problem, uid }: { problem: Problem; uid: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const join = () => {
    setError(null)
    setBusy(true)
    joinProblem(problem.id, uid)
      .then(() => navigate(problemPath(problem.id)))
      .catch((err: unknown) => {
        setError(`参加できませんでした: ${err instanceof Error ? err.message : String(err)}`)
        setBusy(false)
      })
  }

  return (
    <section>
      <h2>問題に招待されています</h2>
      <p>
        <strong>{problem.title}</strong>（参加者 {problem.memberUids.length} 人）
      </p>
      {isAllSubmitted(problem) ? (
        <p>参加者全員が提出したので，この問題は締め切られています．</p>
      ) : (
        <>
          <p>参加すると，問題の本文を読んで解法を投稿できます．</p>
          <button type="button" onClick={join} disabled={busy}>
            参加する
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

export default JoinProblem
