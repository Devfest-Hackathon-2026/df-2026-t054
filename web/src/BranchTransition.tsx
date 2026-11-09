import { laneColors } from './branchColors.ts'
import type { Boundary } from './comparisons.ts'

type Line = [x1: number, x2: number, color: string]

// x は 0〜100（左の道の中心が 25，右が 75，まとまった道が 50）．上端の x と下端の x
const lineSets: Record<Exclude<Boundary, null>, Line[]> = {
  'start-split': [
    [25, 25, laneColors.left],
    [75, 75, laneColors.right],
  ],
  branch: [
    [50, 25, laneColors.left],
    [50, 75, laneColors.right],
  ],
  merge: [
    [25, 50, laneColors.left],
    [75, 50, laneColors.right],
  ],
  continue: [[50, 50, laneColors.same]],
}

const labels: Record<Exclude<Boundary, null>, string | null> = {
  'start-split': '最初から分かれている',
  branch: '分岐点',
  merge: '合流点',
  continue: null,
}

// 区間のあいだの線．分岐点は1本が2本に，合流点は2本が1本になる
function BranchTransition({ boundary }: { boundary: Exclude<Boundary, null> }) {
  const label = labels[boundary]
  return (
    <div style={{ gridColumn: '1 / span 2', position: 'relative', height: label ? '3em' : '1.25em' }}>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true">
        {lineSets[boundary].map(([x1, x2, color]) => (
          <line key={`${x1}-${x2}`} x1={x1} y1={0} x2={x2} y2={40} stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {label && (
        <strong
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--color-surface)',
            padding: '0 0.5em',
            borderRadius: '0.5em',
            border: '1px solid var(--color-border-strong)',
            fontSize: 'var(--text-sm)',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </strong>
      )}
    </div>
  )
}

export default BranchTransition
