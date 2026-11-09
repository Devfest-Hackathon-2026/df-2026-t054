import StepListWithThreads from './StepListWithThreads.tsx'
import type { ThreadViewer } from './threads.ts'
import { useSteps } from './useSteps.ts'

// 自分用の StepsStatus は「出し直してください」と促すので，ほかの人の欄では状態だけを出す
function OtherStepsStatus({ problemId, uid, viewer }: { problemId: string; uid: string; viewer: ThreadViewer }) {
  const { steps, error } = useSteps(problemId, uid)

  if (error) return <p role="alert">ステップを読み込めませんでした: {error.message}</p>
  if (steps === undefined) return <p>ステップを読み込み中…</p>
  if (steps === null || steps.status === 'processing') return <p role="status">AI がステップに分けています…</p>
  if (steps.status === 'failed') return <p role="alert">この投稿はステップに分けられませんでした．</p>
  return (
    <>
      <h5>思考ステップ（AI が分けたもの）</h5>
      <StepListWithThreads
        problemId={problemId}
        stepOwnerUid={uid}
        steps={steps.thoughtSteps?.steps ?? []}
        viewer={viewer}
        mathChecks={steps.mathChecks ?? null}
      />
    </>
  )
}

export default OtherStepsStatus
