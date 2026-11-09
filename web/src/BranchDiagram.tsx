import type { ReactNode } from 'react'
import AlignedSteps, { type AlignedStep } from './AlignedSteps.tsx'
import BranchTransition from './BranchTransition.tsx'
import SplitLane from './SplitLane.tsx'
import { laneColors } from './branchColors.ts'
import { boundaryBefore, type Segment } from './comparisons.ts'
import type { Step } from './thoughtSteps.ts'

// 2つの投稿のステップを2本の道として並べ，同じ区間は1本にまとめ，分かれた区間は左右に分ける．
// segments の a が左（left），b が右（right）．形は shared/schema/step-alignment.schema.json
// 設計原則: 「同じ／分かれた」は AI の対応づけ（提案）で，正誤やどちらがよいかは表さない
// extra: ステップの下に出すもの（AI の問いかけと本人の理由）
type Lane = { label: string; steps: Step[]; extra?: (stepId: string) => ReactNode }

function BranchDiagram({
  segments,
  left,
  right,
}: {
  segments: Segment[]
  left: Lane
  right: Lane
}) {
  const items = (steps: Step[], ids: string[]): AlignedStep[] =>
    ids.map((id) => {
      const i = steps.findIndex((s) => s.id === id)
      return { id, no: i + 1, step: steps[i] }
    })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '1.5em' }}>
      <div style={headerStyle(laneColors.left)}>{left.label}</div>
      <div style={headerStyle(laneColors.right)}>{right.label}</div>
      {segments.map((seg, i) => {
        const boundary = boundaryBefore(segments, i)
        return (
          // 区間は並べ替わらないので順番を key にする
          <div key={i} style={{ display: 'contents' }}>
            {boundary && <BranchTransition boundary={boundary} />}
            {seg.type === 'same' ? (
              <section aria-label="同じことをした区間" style={sameStyle}>
                <small className="muted" style={{ gridColumn: '1 / span 2' }}>同じことをした（AI の対応づけ）</small>
                <AlignedSteps items={items(left.steps, seg.a)} extra={left.extra} />
                <AlignedSteps items={items(right.steps, seg.b)} extra={right.extra} />
              </section>
            ) : (
              <>
                <SplitLane color={laneColors.left} items={items(left.steps, seg.a)} who={left.label} extra={left.extra} />
                <SplitLane color={laneColors.right} items={items(right.steps, seg.b)} who={right.label} extra={right.extra} />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

const headerStyle = (color: string) => ({
  borderBottom: `4px solid ${color}`,
  fontWeight: 'bold',
  paddingBottom: '0.25em',
  marginBottom: '0.5em',
  textAlign: 'center' as const,
})

const sameStyle = {
  gridColumn: '1 / span 2',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  columnGap: '1.5em',
  rowGap: '0.25em',
  border: `3px solid ${laneColors.same}`,
  borderRadius: '0.75em',
  padding: '0.5em 0.75em',
}

export default BranchDiagram
