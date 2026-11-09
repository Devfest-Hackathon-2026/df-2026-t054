import type { ReactNode } from 'react'
import MathCheckList from './MathCheckList.tsx'
import MathCheckNote from './MathCheckNote.tsx'
import type { MathChecks, Step, StepSource } from './thoughtSteps.ts'

// 1つの投稿の思考ステップを順に並べる（何を・なぜ・元の場所）．
// 設計原則: AI は理由を書かない．why が空なら空のまま見せ，AI が抜き出した本人の言葉はそうと分かるように示す
// onSeekVideo を渡すと，動画のステップの時刻がボタンになり，押すとその時刻から再生する．
// mathChecks を渡すと，式変形のあるステップに SymPy で確かめた結果（参考）を添える（#22）．
// renderStepExtra を渡すと，各ステップの下にその中身を出す（質問のスレッドなど）
function StepList({
  steps,
  mathChecks = null,
  onSeekVideo,
  renderStepExtra,
}: {
  steps: Step[]
  mathChecks?: MathChecks | null
  onSeekVideo?: (sec: number) => void
  renderStepExtra?: (step: Step) => ReactNode
}) {
  const checks = mathChecks?.checks ?? []
  return (
    <>
      <ol className="step-list">
        {steps.map((step) => (
          <li key={step.id}>
            <div>
              <strong>何を:</strong> {step.what}
            </div>
            <div>
              <strong>なぜ:</strong>{' '}
              {step.why === null ? (
                <span className="muted">（まだ書かれていません）</span>
              ) : (
                <>
                  「{step.why.text}」
                  <small className="muted">
                    {step.why.by === 'post_quote' ? '（AI が投稿から抜き出した本人の言葉）' : '（本人が書いた理由）'}
                  </small>
                  {/* 本人が「自分の言葉か」を確かめられるよう，抜き出し元も見せる（承認・削除は #20） */}
                  {step.why.by === 'post_quote' && step.transcript && (
                    <div>
                      <small className="muted pre-wrap">抜き出し元: {step.transcript}</small>
                    </div>
                  )}
                </>
              )}
            </div>
            {checks.some((c) => c.stepId === step.id) && (
              <MathCheckList checks={checks.filter((c) => c.stepId === step.id)} />
            )}
            {step.source.kind === 'video' && onSeekVideo ? (
              <button type="button" onClick={() => onSeekVideo(videoStart(step.source))}>
                ▶ {sourceLabel(step.source)} から再生
              </button>
            ) : (
              <small className="muted">{sourceLabel(step.source)}</small>
            )}
            {renderStepExtra?.(step)}
          </li>
        ))}
      </ol>
      {mathChecks?.code && <MathCheckNote checks={checks} code={mathChecks.code} />}
    </>
  )
}

// onClick の中では step.source の絞り込みが効かないので，種類を見直して開始時刻を取る
const videoStart = (source: StepSource) => (source.kind === 'video' ? source.startSec : 0)

const mmss =(sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

function sourceLabel(source: StepSource): string {
  if (source.kind === 'video') {
    const [start, end] = [mmss(source.startSec), mmss(source.endSec)]
    // 短いステップは同じ秒に丸まるので，そのときは片方だけ出す
    return start === end ? `動画 ${start}` : `動画 ${start}〜${end}`
  }
  if (source.kind === 'image') return `${source.imageIndex + 1}枚目の画像`
  return source.lineStart === source.lineEnd ? `${source.lineStart}行目` : `${source.lineStart}〜${source.lineEnd}行目`
}

export default StepList
