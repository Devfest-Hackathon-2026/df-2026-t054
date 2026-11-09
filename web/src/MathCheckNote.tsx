import type { MathCheck } from './thoughtSteps.ts'

// 式の確認（参考）の断り書きと，SymPy の出力・実行したコード．人が確かめ方を見られるようにする（#22）
// stepId は s1, s2, … とサーバーが順に振り直しているので，s を除いた数が何番目のステップか（009）
function MathCheckNote({ checks, code }: { checks: MathCheck[]; code: string }) {
  return (
    <details>
      <summary>
        <small>
          式の確認について: AI が投稿の式を写し，SymPy で計算した参考です．AI が式を写し間違えることもあります．
          正しいかどうかは自分で確かめてください．
        </small>
      </summary>
      <small>SymPy の出力（同じ式にならなかったときは，前の式から後の式を引いて簡単にしたもの）:</small>
      <ul>
        {checks.map((c, i) => (
          <li key={i}>
            <small>
              ステップ {c.stepId.slice(1)}: <code>{c.before}</code> → <code>{c.after}</code>: {c.result}
              {c.detail !== null && (
                <>
                  {' '}
                  （<code>{c.detail}</code>）
                </>
              )}
            </small>
          </li>
        ))}
      </ul>
      <small>実行したコード:</small>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 'small' }}>{code}</pre>
    </details>
  )
}

export default MathCheckNote
