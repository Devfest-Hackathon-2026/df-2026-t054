import { useThreads } from './useThreads.ts'

// 自分の解法の見出しの近くに，ほかの参加者から自分のステップに付いた質問の件数を出す．
// 質問は思考ステップの一覧の下のほうに出るので，気づけるようにする．読めるのは全員が提出したあとだけなので，そのときだけ使う
function MyThreadsNotice({ problemId, uid }: { problemId: string; uid: string }) {
  const { threads } = useThreads(problemId, uid)
  const count = threads?.filter((t) => t.uid !== uid).length ?? 0

  // 読み込めなかったときは，下の一覧（StepListWithThreads）がエラーを出すので，ここでは何も出さない
  if (count === 0) return null
  return <p role="status">あなたのステップに質問が {count} 件あります．下の思考ステップの一覧で返信できます．</p>
}

export default MyThreadsNotice
