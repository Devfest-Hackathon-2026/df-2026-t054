import type { ReactNode } from 'react'
import AlignedSteps, { type AlignedStep } from './AlignedSteps.tsx'

// 分かれた区間の片方の道．ステップが無い側（もう片方だけが進んだ部分）は線だけ引く
function SplitLane({
  color,
  items,
  who,
  extra,
}: {
  color: string
  items: AlignedStep[]
  who: string
  extra?: (stepId: string) => ReactNode
}) {
  if (items.length === 0) {
    return (
      <div
        aria-label={`${who}: この区間のステップはありません`}
        style={{ borderLeft: `3px dashed ${color}`, marginLeft: '50%', minHeight: '2em' }}
      />
    )
  }
  return (
    <section aria-label={`${who} の道`} style={{ border: `3px solid ${color}`, borderRadius: '0.75em', padding: '0.5em 0.75em' }}>
      <AlignedSteps items={items} extra={extra} />
    </section>
  )
}

export default SplitLane
