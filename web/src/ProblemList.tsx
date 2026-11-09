import Link from './Link.tsx'
import { problemPath } from './problems.ts'
import { useMyProblems } from './useMyProblems.ts'

function ProblemList({ uid }: { uid: string }) {
  const { problems, error } = useMyProblems(uid)

  return (
    <section>
      <h2>参加している問題</h2>
      {error ? (
        <p role="alert">一覧を読み込めませんでした: {error.message}</p>
      ) : problems === undefined ? (
        <p>読み込み中…</p>
      ) : problems.length === 0 ? (
        <p>まだありません．問題を作るか，招待リンクから参加してください．</p>
      ) : (
        <ul>
          {problems.map((p) => (
            <li key={p.id}>
              <Link to={problemPath(p.id)}>{p.title}</Link>（参加者 {p.memberUids.length} 人）
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default ProblemList
