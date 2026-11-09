import StepList from './StepList.tsx'
import StepThreads from './StepThreads.tsx'
import type { MathChecks, Step } from './thoughtSteps.ts'
import type { ThreadViewer } from './threads.ts'
import { useThreads } from './useThreads.ts'

// 思考ステップの一覧に，ステップごとの質問のスレッドを付けたもの．
// 質問を読めるのは全員が提出したあとだけなので，それより前は StepList をそのまま使う
function StepListWithThreads({
  problemId,
  stepOwnerUid,
  steps,
  viewer,
  mathChecks = null,
  onSeekVideo,
}: {
  problemId: string
  stepOwnerUid: string
  steps: Step[]
  viewer: ThreadViewer
  mathChecks?: MathChecks | null
  onSeekVideo?: (sec: number) => void
}) {
  const { threads, error } = useThreads(problemId, stepOwnerUid)

  return (
    <>
      {error && <p role="alert">質問を読み込めませんでした: {error.message}</p>}
      <StepList
        steps={steps}
        mathChecks={mathChecks}
        onSeekVideo={onSeekVideo}
        renderStepExtra={(step) =>
          threads && (
            <StepThreads
              problemId={problemId}
              stepOwnerUid={stepOwnerUid}
              stepId={step.id}
              threads={threads.filter((t) => t.stepId === step.id)}
              viewer={viewer}
            />
          )
        }
      />
    </>
  )
}

export default StepListWithThreads
