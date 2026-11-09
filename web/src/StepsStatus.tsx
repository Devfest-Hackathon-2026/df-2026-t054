import type { Timestamp } from 'firebase/firestore'
import type { PostKind } from './posts.ts'
import RetryStepsButton from './RetryStepsButton.tsx'
import StepList from './StepList.tsx'
import StepListWithThreads from './StepListWithThreads.tsx'
import type { StepsDoc } from './thoughtSteps.ts'
import type { ThreadViewer } from './threads.ts'
import { useNow } from './useNow.ts'
import { useSteps } from './useSteps.ts'

// サーバーの上限（timeoutSeconds: 300）を少し超えたら止まったとみなす
const stuckMs = 6 * 60 * 1000

// 分けられなかったときに，どうすればよいか（issue-73）．理由は「読み取れたか」だけで，解き方の正誤・出来には触れない
function failureHints(code: StepsDoc['errorCode'], kind: PostKind): string[] {
  if (code === 'temporary') return ['少し待ってから「もう一度ステップに分ける」を押してください．']
  if (code !== 'unreadable') return []
  const byKind: Record<PostKind, string[]> = {
    image: [
      '明るい場所で，影が入らないように撮り直す',
      '字が画像の端で切れていないか，ピントが合っているか確かめる',
      '解き方を書いたページを選んでいるか確かめる',
    ],
    video: ['声がはっきり聞き取れるか確かめる', '書いているところが映っているか確かめる（使われるのは先頭の60秒です）'],
    text: ['式や説明など，解き方の手順が書かれているか確かめる'],
  }
  return [...byKind[kind], '直したら「出し直す」で投稿し直してください．同じ内容のまま試すなら「もう一度ステップに分ける」．']
}

// 分けている間に出す，待ち時間の目安（issue-91）．本番のログ（2026-11 の数件．文章 3 秒・画像 4〜7 秒・動画 20〜27 秒ほど）と，
// 画像を gemini-3.8-flash にしたときの遅い回（docs/decisions/issue-50-model-per-kind.md）から，少し余裕を持たせた
const waitHints: Record<PostKind, string> = {
  text: 'ふつうは30秒以内に終わります．',
  image: 'ふつうは1分以内に終わります．混んでいるときは2〜3分かかることがあります．',
  video: 'ふつうは1分ほどで終わります．長い動画は数分かかることがあります．',
}

function Processing({ kind }: { kind: PostKind }) {
  return (
    <p role="status">
      AI がステップに分けています…
      <br />
      <small>{waitHints[kind]}このページを開いたままにしなくても，あとで開けば結果が出ています．</small>
    </p>
  )
}

// 投稿を思考ステップに分ける処理（server/）の状態と，分け終わったらステップの一覧
// onSeekVideo: 動画の投稿のとき，ステップを押したらその時刻から再生する
// viewer: 全員が提出したあとだけ渡す．ステップごとに質問のスレッドを出す
// onRetry: 投稿を書き直せる（締め切り前で未提出）ときだけ渡す．失敗・止まったときに「もう一度ステップに分ける」を出す
function StepsStatus({
  problemId,
  uid,
  postCreatedAt,
  postKind,
  onSeekVideo,
  viewer,
  onRetry,
}: {
  problemId: string
  uid: string
  postCreatedAt: Timestamp | null
  postKind: PostKind
  onSeekVideo?: (sec: number) => void
  viewer?: ThreadViewer
  onRetry?: () => Promise<void>
}) {
  const { steps, error } = useSteps(problemId, uid)
  const now = useNow(30_000)

  if (error) return <p role="alert">ステップの状態を読み込めませんでした: {error.message}</p>
  if (steps === undefined) return <p>ステップの状態を読み込み中…</p>
  // 出し直した直後は，前の投稿の結果が残っているので処理待ちとして扱う
  const current = steps && postCreatedAt && steps.postCreatedAt.isEqual(postCreatedAt)
  if (!current) return <Processing kind={postKind} />
  const retryButton = onRetry && <RetryStepsButton onRetry={onRetry} />
  if (steps.status === 'processing') {
    // サーバーがタイムアウト・クラッシュすると processing のまま残るので，長く続いたらやり直しを促す
    const startedMs = steps.updatedAt?.toMillis()
    if (startedMs !== undefined && now - startedMs > stuckMs)
      return (
        <div role="alert">
          <p>時間がかかっています．もう一度ステップに分けるか，出し直してください．</p>
          {retryButton}
        </div>
      )
    return <Processing kind={postKind} />
  }
  if (steps.status === 'failed') {
    const hints = failureHints(steps.errorCode, postKind)
    return (
      <div role="alert">
        <p>{steps.error}</p>
        {hints.length > 0 && (
          <ul>
            {hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
        {retryButton}
      </div>
    )
  }
  return (
    <>
      <h4>思考ステップ（AI が分けたもの）</h4>
      {viewer ? (
        <StepListWithThreads
          problemId={problemId}
          stepOwnerUid={uid}
          steps={steps.thoughtSteps?.steps ?? []}
          viewer={viewer}
          mathChecks={steps.mathChecks ?? null}
          onSeekVideo={onSeekVideo}
        />
      ) : (
        <StepList steps={steps.thoughtSteps?.steps ?? []} mathChecks={steps.mathChecks ?? null} onSeekVideo={onSeekVideo} />
      )}
    </>
  )
}

export default StepsStatus
