import { useRef, useState } from 'react'
import MyThreadsNotice from './MyThreadsNotice.tsx'
import PostForm from './PostForm.tsx'
import PostView from './PostView.tsx'
import { retrySteps } from './posts.ts'
import StepsStatus from './StepsStatus.tsx'
import SubmitControls from './SubmitControls.tsx'
import { usePost } from './usePost.ts'

// 問題の詳細ページの「自分の解法」．まだなら投稿フォーム，投稿済みなら中身と AI が分けたステップ．
// 投稿は下書きで，ステップを見てから「この内容で提出」で提出する（docs/decisions/issue-70-confirm-submit.md）．
// 下書きのあいだは出し直せる．提出したあとは，締め切り前なら取り消して出し直せる．
// submitted: 自分が submittedUids に入っているか．closed: 全員が提出して締め切られたか．
// memberUids: 締め切られたあと，自分のステップへの質問に「参加者N」と出すのに使う
function PostSection({
  problemId,
  uid,
  submitted,
  closed,
  memberUids,
}: {
  problemId: string
  uid: string
  submitted: boolean
  closed: boolean
  memberUids: string[]
}) {
  const { post, error } = usePost(problemId, uid)
  const [redoing, setRedoing] = useState(false)
  // 動画のステップを押したら，その時刻から再生する
  const videoRef = useRef<HTMLVideoElement>(null)
  const seekVideo = (sec: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = sec
    video.scrollIntoView({ block: 'nearest' })
    // 再生できなくても（ブラウザが止めたなど）頭出しはできているので，エラーは出さない
    video.play().catch(() => {})
  }

  let content
  if (error) content = <p role="alert">投稿を読み込めませんでした: {error.message}</p>
  else if (post === undefined) content = <p>読み込み中…</p>
  else if (post === null) content = <PostForm problemId={problemId} uid={uid} />
  else if (redoing && !closed && !submitted) {
    content = (
      <>
        <p>新しく投稿すると，今の投稿と置き換わります．</p>
        <PostForm problemId={problemId} uid={uid} onDone={() => setRedoing(false)} />
        <button type="button" onClick={() => setRedoing(false)}>
          やめる
        </button>
      </>
    )
  } else {
    content = (
      <>
        <p>
          <strong>{submitted ? '提出済み' : '下書き'}</strong>
        </p>
        <PostView post={post} videoRef={videoRef} />
        <StepsStatus
          problemId={problemId}
          uid={uid}
          postCreatedAt={post.createdAt}
          postKind={post.kind}
          onSeekVideo={post.kind === 'video' ? seekVideo : undefined}
          viewer={closed ? { uid, memberUids } : undefined}
          onRetry={!closed && !submitted ? () => retrySteps(problemId, uid, post) : undefined}
        />
        {closed ? (
          <p>全員が提出したので，投稿は出し直せません．</p>
        ) : (
          <>
            <SubmitControls problemId={problemId} uid={uid} postCreatedAt={post.createdAt} submitted={submitted} />
            {!submitted && (
              <button type="button" onClick={() => setRedoing(true)}>
                出し直す
              </button>
            )}
          </>
        )}
      </>
    )
  }

  return (
    <section>
      <h3>自分の解法</h3>
      {closed && <MyThreadsNotice problemId={problemId} uid={uid} />}
      {content}
    </section>
  )
}

export default PostSection
