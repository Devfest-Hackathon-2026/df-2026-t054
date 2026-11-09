import { useState } from 'react'
import type { Timestamp } from 'firebase/firestore'
import { submitPost, withdrawSubmission } from './posts.ts'
import { useSteps } from './useSteps.ts'

// 「この内容で提出」と「提出を取り消す」（docs/decisions/issue-70-confirm-submit.md）．締め切り前だけ使う．
// 提出できるのは，今の投稿のステップ化が done になってから（ルールでも同じ条件で拒否する）
function SubmitControls({
  problemId,
  uid,
  postCreatedAt,
  submitted,
}: {
  problemId: string
  uid: string
  postCreatedAt: Timestamp | null
  submitted: boolean
}) {
  const { steps } = useSteps(problemId, uid)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = (action: Promise<void>, failed: string) => {
    setError(null)
    setBusy(true)
    action
      .catch((err: unknown) => setError(`${failed}: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => setBusy(false))
  }

  if (submitted) {
    return (
      <>
        <p>
          この内容で提出しました．全員が提出すると締め切られ，ほかの人の解法と比べられるようになります．
          直したいときは，締め切りの前なら提出を取り消して出し直せます．
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(withdrawSubmission(problemId, uid), '提出を取り消せませんでした')}
        >
          提出を取り消す
        </button>
        {error && <p role="alert">{error}</p>}
      </>
    )
  }

  // 出し直した直後は前の投稿の結果が残っているので，今の投稿と同じ版のときだけ done と見なす
  const current = !!steps && !!postCreatedAt && steps.postCreatedAt.isEqual(postCreatedAt)
  const ready = current && steps.status === 'done'
  const failed = current && steps.status === 'failed'
  return (
    <>
      <p>
        まだ提出していません（下書き）．AI が分けたステップを確かめてから提出してください．
        {failed
          ? 'ステップに分けられなかったので，このままでは提出できません．もう一度ステップに分けるか，出し直してください．'
          : !ready && 'ステップに分け終わると提出できます．'}
      </p>
      <button
        type="button"
        disabled={busy || !ready}
        onClick={() => run(submitPost(problemId, uid), '提出できませんでした')}
      >
        この内容で提出
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  )
}

export default SubmitControls
