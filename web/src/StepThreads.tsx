import { useState } from 'react'
import StepThread from './StepThread.tsx'
import ThreadTextForm from './ThreadTextForm.tsx'
import { addThread, type Thread, type ThreadViewer } from './threads.ts'

// 1つのステップに付いた質問の一覧と，質問を付ける欄．
// 動画のステップへの質問は，そのステップの時刻への質問を兼ねる（時刻はステップの「▶ 再生」で開く）
function StepThreads({
  problemId,
  stepOwnerUid,
  stepId,
  threads,
  viewer,
}: {
  problemId: string
  stepOwnerUid: string
  stepId: string
  threads: Thread[]
  viewer: ThreadViewer
}) {
  // 質問が無いうちは欄を閉じておき，一覧が長くならないようにする
  const [asking, setAsking] = useState(false)

  return (
    <div>
      {threads.map((thread) => (
        <StepThread key={thread.id} problemId={problemId} thread={thread} viewer={viewer} />
      ))}
      {asking ? (
        <ThreadTextForm
          label="このステップへの質問を書く"
          submitLabel="質問する"
          onSubmit={(text) => addThread(problemId, viewer.uid, stepOwnerUid, stepId, text).then(() => setAsking(false))}
          onCancel={() => setAsking(false)}
        />
      ) : (
        <button type="button" onClick={() => setAsking(true)}>
          このステップに質問する
        </button>
      )}
    </div>
  )
}

export default StepThreads
