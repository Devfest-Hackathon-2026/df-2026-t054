import type { CSSProperties, Ref } from 'react'
import type { Post } from './posts.ts'
import { useDownloadUrls } from './useDownloadUrls.ts'

// 画像・動画を見やすい大きさに抑える．幅は 640px かページの幅の小さいほう，高さは画面の 70% まで（iOS Safari でアドレスバーが出ていても収まるよう svh で測る）．
// width・height は auto のままにして，小さいものは引き伸ばさず，縦横比も変えない（object-fit で切り取らない）
const mediaStyle: CSSProperties = { maxWidth: 'min(100%, 640px)', maxHeight: '70svh', display: 'block' }

// videoRef: 動画の投稿のとき，ステップから頭出しできるよう <video> を渡す
function PostView({ post, videoRef }: { post: Post; videoRef?: Ref<HTMLVideoElement> }) {
  const paths = post.kind === 'image' ? post.imagePaths : post.kind === 'video' ? [post.videoPath] : []
  const { urls, error } = useDownloadUrls(paths)

  if (post.kind === 'text') {
    return <pre style={{ whiteSpace: 'pre-wrap' }}>{post.text}</pre>
  }
  if (error) return <p role="alert">ファイルを読み込めませんでした: {error.message}</p>
  if (!urls) return <p>読み込み中…</p>
  if (post.kind === 'video') {
    return (
      <p>
        <video ref={videoRef} src={urls[0]} controls preload="metadata" style={mediaStyle} />
        {Math.round(post.durationSec)}秒
      </p>
    )
  }
  return (
    <p>
      {urls.map((url, i) => (
        <img key={url} src={url} alt={`${i + 1}枚目`} style={mediaStyle} />
      ))}
    </p>
  )
}

export default PostView
