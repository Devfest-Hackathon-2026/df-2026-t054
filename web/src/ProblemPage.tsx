import { useEffect } from 'react'
import JoinProblem from './JoinProblem.tsx'
import Link from './Link.tsx'
import ProblemDetail from './ProblemDetail.tsx'
import { problemPath } from './problems.ts'
import { useProblem } from './useProblem.ts'
import { navigate } from './useRoute.ts'

// /problems/:id と /problems/:id/join（招待リンク）．参加していれば詳細，していなければ参加の確認を出す
function ProblemPage({ problemId, uid, isJoinLink }: { problemId: string; uid: string; isJoinLink: boolean }) {
  const { problem, closed, error } = useProblem(problemId)
  const isMember = !!problem && problem.memberUids.includes(uid)

  // 参加済みの人が招待リンクを開いたら詳細へ
  useEffect(() => {
    if (isJoinLink && isMember) navigate(problemPath(problemId))
  }, [isJoinLink, isMember, problemId])

  return (
    <>
      <p>
        <Link to="/">← 問題一覧へ</Link>
      </p>
      {error ? (
        <p role="alert">問題を読み込めませんでした: {error.message}</p>
      ) : problem === undefined ? (
        <p>読み込み中…</p>
      ) : problem === null ? (
        <p>問題が見つかりません．リンクが正しいか確かめてください．</p>
      ) : isMember ? (
        <ProblemDetail problem={problem} uid={uid} closed={closed} />
      ) : (
        <JoinProblem problem={problem} uid={uid} />
      )}
    </>
  )
}

export default ProblemPage
