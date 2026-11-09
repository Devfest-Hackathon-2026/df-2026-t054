import type { ReactNode } from 'react'
import type { Step } from './thoughtSteps.ts'

// 分岐点の図の1つの区間に入る，片方の人のステップ．no は投稿の中での順番（1 始まり．見つからなければ 0）
export type AlignedStep = { no: number; step: Step | undefined; id: string }

// extra を渡すと，ステップの下に出す（AI の問いかけと本人の理由）
function AlignedSteps({ items, extra }: { items: AlignedStep[]; extra?: (stepId: string) => ReactNode }) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map(({ no, step, id }) => (
        <li key={id} style={{ margin: '0.25em 0' }}>
          <small className="muted">ステップ {no > 0 ? no : id}</small>
          <div>{step ? step.what : <span className="muted">（このステップは見つかりません）</span>}</div>
          {step && extra?.(id)}
        </li>
      ))}
    </ol>
  )
}

export default AlignedSteps
