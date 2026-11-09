import OtherStepsStatus from './OtherStepsStatus.tsx'
import PostView from './PostView.tsx'
import type { ThreadViewer } from './threads.ts'
import { usePost } from './usePost.ts'

// ほかの参加者1人の投稿とステップ一覧．読めるのは全員が提出したあとだけ（firebase/firestore.rules の canSeeOthers）．
// ルールで拒否されたときも画面を落とさず，その人の欄にだけエラーを出す
function OtherPost({
  problemId,
  uid,
  label,
  viewer,
}: {
  problemId: string
  uid: string
  label: string
  viewer: ThreadViewer
}) {
  const { post, error } = usePost(problemId, uid)

  let content
  if (error) {
    // ルールで拒否されたとき（全員が提出する前に読もうとした場合）は，ルールのエラー文でなく理由を出す
    const denied = 'code' in error && error.code === 'permission-denied'
    content = (
      <p role="alert">
        {denied ? '全員が提出するまで，この人の投稿は読めません．' : `投稿を読み込めませんでした: ${error.message}`}
      </p>
    )
  } else if (post === undefined) content = <p>読み込み中…</p>
  else if (post === null) content = <p>投稿がありません．</p>
  else {
    content = (
      <>
        <PostView post={post} />
        <OtherStepsStatus problemId={problemId} uid={uid} viewer={viewer} />
      </>
    )
  }

  return (
    <section>
      <h4>{label}</h4>
      {content}
    </section>
  )
}

export default OtherPost
