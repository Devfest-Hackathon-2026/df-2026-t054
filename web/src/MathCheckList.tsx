import type { MathCheck } from './thoughtSteps.ts'

// 1つのステップの式変形を SymPy で確かめた結果（参考）．docs/decisions/issue-22-sympy-check.md
// 設計原則: AI に正誤を判定させない．「正しい／誤り」とは書かず，SymPy で計算したときの事実だけを書く
const resultText: Record<MathCheck['result'], string> = {
  same: 'SymPy で計算すると同じ式になった',
  not_confirmed: 'SymPy では同じ式だと確かめられなかった（違う式とは限らない）',
  unparsed: '式として読み取れず，確かめていない',
}

function MathCheckList({ checks }: { checks: MathCheck[] }) {
  return (
    <div>
      <strong>式の確認（参考）:</strong>
      <ul style={{ margin: 0 }}>
        {checks.map((c, i) => (
          <li key={i}>
            <code>{c.before}</code> → <code>{c.after}</code>: {resultText[c.result]}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default MathCheckList
