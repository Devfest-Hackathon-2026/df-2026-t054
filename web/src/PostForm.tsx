import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  checkImages,
  checkVideoFile,
  imageMaxCount,
  imageTypes,
  postImages,
  postText,
  postVideo,
  readVideoDuration,
  textMaxLength,
  videoMaxSec,
  videoTypes,
  type PostKind,
} from './posts.ts'

const kindLabels: Record<PostKind, string> = {
  image: '手書きの写真',
  text: 'LaTeX・テキスト',
  video: '説明動画',
}

// 選んだ画像と，縮小表示に使う object URL
type PickedImage = { file: File; url: string }

const revoke = (list: PickedImage[]) => list.forEach((p) => URL.revokeObjectURL(p.url))

// 解法を投稿する（下書き．提出は AI が分けたステップを見てから別のボタンで行う）．
// 画像・動画は Storage に上げてから，Firestore に投稿を書く
function PostForm({ problemId, uid, onDone }: { problemId: string; uid: string; onDone?: () => void }) {
  const [kind, setKind] = useState<PostKind>('image')
  const [images, setImages] = useState<PickedImage[]>([])
  const [text, setText] = useState('')
  const [video, setVideo] = useState<{ file: File; durationSec: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)

  // 長さを読んでいる間に選び直されたら，前のファイルの結果を捨てるため
  const pendingVideo = useRef<File | null>(null)

  // 投稿して閉じたとき（アンマウント）に，残っている縮小表示の URL を解放する
  const imagesRef = useRef(images)
  useEffect(() => {
    imagesRef.current = images
  }, [images])
  useEffect(() => () => revoke(imagesRef.current), [])
  const files = images.map((p) => p.file)

  // 種類を切り替えると入力欄が作り直されて空になるので，選んだファイルとエラーも消す（テキストは残す）
  const changeKind = (k: PostKind) => {
    setKind(k)
    revoke(images)
    setImages([])
    setVideo(null)
    setError(null)
    pendingVideo.current = null
  }

  // 選ぶたびに今の一覧の後ろに足す（スマホのカメラで1枚ずつ撮れるように）．
  // 足すと上限などを超えるなら足さずに理由を出す．並び順がそのまま imageIndex になる
  const pickImages = (picked: File[]) => {
    if (picked.length === 0) return
    // 同じ写真（名前・大きさ・更新日時が同じ）を重ねて選んだら足さない
    const isSame = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified
    const fresh = picked.filter((f, i) => !files.some((g) => isSame(f, g)) && picked.findIndex((g) => isSame(f, g)) === i)
    const skipped = picked.length - fresh.length
    const problem = checkImages([...files, ...fresh])
    if (problem) return setError(problem)
    setError(skipped > 0 ? `同じ写真が選ばれていたので，${skipped}枚は足していません．` : null)
    setImages([...images, ...fresh.map((file) => ({ file, url: URL.createObjectURL(file) }))])
  }

  const removeImage = (i: number) => {
    revoke([images[i]])
    setImages(images.filter((_, j) => j !== i))
    setError(null)
  }

  // i 番目と i+d 番目を入れ替える
  const moveImage = (i: number, d: -1 | 1) => {
    const next = [...images]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    setImages(next)
  }

  const pickVideo = (file: File | undefined) => {
    setVideo(null)
    setError(null)
    pendingVideo.current = file ?? null
    if (!file) return
    const problem = checkVideoFile(file)
    if (problem) return setError(problem)
    readVideoDuration(file).then(
      (durationSec) => {
        if (pendingVideo.current !== file) return
        if (durationSec > videoMaxSec) {
          setError(`動画は${videoMaxSec}秒以内にしてください（選んだ動画は${Math.ceil(durationSec)}秒）．`)
        } else {
          setVideo({ file, durationSec })
        }
      },
      (e: Error) => {
        if (pendingVideo.current === file) setError(e.message)
      },
    )
  }

  const ready =
    kind === 'image' ? !checkImages(files) : kind === 'text' ? !!text.trim() : !!video

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const action =
      kind === 'image'
        ? postImages(problemId, uid, files, setProgress)
        : kind === 'text'
          ? postText(problemId, uid, text.trim())
          : postVideo(problemId, uid, video!.file, video!.durationSec, setProgress)
    action
      .then(() => onDone?.())
      .catch((err: unknown) => setError(`投稿できませんでした: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => {
        setBusy(false)
        setProgress(null)
      })
  }

  return (
    <form onSubmit={onSubmit}>
      <fieldset disabled={busy}>
        <legend>投稿の種類</legend>
        {(Object.keys(kindLabels) as PostKind[]).map((k) => (
          <label key={k}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => changeKind(k)} />
            {kindLabels[k]}{' '}
          </label>
        ))}
      </fieldset>

      {kind === 'image' && (
        <>
          <p>
            <label>
              写真（{imageMaxCount}枚まで．1枚10MBまで．JPEG・PNG・WebP．何回かに分けて選べます）
              <br />
              <input
                type="file"
                accept={imageTypes.join(',')}
                multiple
                disabled={busy || images.length >= imageMaxCount}
                onChange={(e) => {
                  pickImages(Array.from(e.target.files ?? []))
                  // 外した画像をもう一度選んでも onChange が起きるように空に戻す
                  e.target.value = ''
                }}
              />
            </label>
          </p>
          {images.length > 0 && (
            <>
              <p>この順に続いているものとして読み取ります．</p>
              {/* 1枚分の幅は，←→ のボタン（44px 四方前後）が横に2つ並ぶ程度にする */}
              <ol style={{ display: 'flex', flexWrap: 'wrap', gap: 8, listStylePosition: 'inside', padding: 0 }}>
                {images.map((p, i) => (
                  <li key={p.url} style={{ width: 112 }}>
                    <img
                      src={p.url}
                      alt={`${i + 1}枚目: ${p.file.name}`}
                      style={{ display: 'block', width: 104, height: 104, objectFit: 'cover' }}
                    />
                    {/* 並べ替えの ←→ は，幅が足りなくても縦に割れないよう1行にまとめる */}
                    <span style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={() => moveImage(i, -1)}
                        disabled={busy || i === 0}
                        aria-label={`${i + 1}枚目を前へ`}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => moveImage(i, 1)}
                        disabled={busy || i === images.length - 1}
                        aria-label={`${i + 1}枚目を後ろへ`}
                      >
                        →
                      </button>
                    </span>
                    <button type="button" onClick={() => removeImage(i)} disabled={busy} aria-label={`${i + 1}枚目を外す`}>
                      外す
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}

      {kind === 'text' && (
        <p>
          <label>
            本文（LaTeX やコードをそのまま貼れます．{textMaxLength}文字まで）
            <br />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={textMaxLength}
              rows={12}
              cols={70}
              disabled={busy}
              style={{ fontFamily: 'monospace' }}
            />
          </label>
        </p>
      )}

      {kind === 'video' && (
        <p>
          <label>
            動画（{videoMaxSec}秒以内．100MBまで．MP4・MOV・WebM）
            <br />
            <input
              type="file"
              accept={videoTypes.join(',')}
              disabled={busy}
              onChange={(e) => pickVideo(e.target.files?.[0])}
            />
          </label>
          {video && <> {Math.round(video.durationSec)}秒</>}
        </p>
      )}

      <button type="submit" disabled={busy || !ready}>
        投稿する
      </button>
      {progress !== null && (
        <p role="status">
          アップロード中… <progress value={progress} max={1} /> {Math.round(progress * 100)}%
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  )
}

export default PostForm
