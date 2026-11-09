import { useState } from 'react'
import ThreadTextForm from './ThreadTextForm.tsx'
import { addReply, deleteReply, deleteThread, memberLabel, type Thread, type ThreadViewer } from './threads.ts'
import { useReplies } from './useReplies.ts'

// ステップに付いた質問1つと，その返信．消せるのは自分が書いたものだけ（firebase/firestore.rules）．
// 返信の付いた質問は消せないようにする（ルールでは返信の有無を確かめられないので，画面で止める）
function StepThread({ problemId, thread, viewer }: { problemId: string; thread: Thread; viewer: ThreadViewer }) {
  const { replies, error } = useReplies(problemId, thread.id)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const remove = (run: () => Promise<void>) => {
    if (!window.confirm('消しますか？')) return
    setDeleteError(null)
    run().catch((err: Error) => setDeleteError(err.message))
  }

  return (
    <div className="thread">
      <div>
        <small className="muted">{memberLabel(viewer, thread.uid)} の質問</small>
        <div className="pre-wrap">{thread.text}</div>
        {thread.uid === viewer.uid && replies?.length === 0 && (
          <button type="button" onClick={() => remove(() => deleteThread(problemId, thread.id))}>
            質問を消す
          </button>
        )}
      </div>
      {error && <p role="alert">返信を読み込めませんでした: {error.message}</p>}
      {replies === undefined && <p>返信を読み込み中…</p>}
      {replies && replies.length > 0 && (
        <ul>
          {replies.map((reply) => (
            <li key={reply.id}>
              <small className="muted">{memberLabel(viewer, reply.uid)}</small>
              <div className="pre-wrap">{reply.text}</div>
              {reply.uid === viewer.uid && (
                <button type="button" onClick={() => remove(() => deleteReply(problemId, thread.id, reply.id))}>
                  返信を消す
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {deleteError && <p role="alert">消せませんでした: {deleteError}</p>}
      <ThreadTextForm
        label="返信を書く"
        submitLabel="返信する"
        onSubmit={(text) => addReply(problemId, thread.id, viewer.uid, text)}
      />
    </div>
  )
}

export default StepThread
