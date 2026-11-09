import { useState } from 'react'
import PairDiagram from './PairDiagram.tsx'
import type { Problem } from './problems.ts'

// 全員が提出したあと，2人を選んで分岐点の図を出す．3人以上なら誰と誰を比べるか選べる
function ComparisonSection({ problem, uid }: { problem: Problem; uid: string }) {
  const members = problem.memberUids
  const label = (u: string) => `参加者${members.indexOf(u) + 1}${u === uid ? '（あなた）' : ''}`
  // 最初は自分（左）と，自分の次に参加した人（右）
  const [left, setLeft] = useState(uid)
  const [right, setRight] = useState(members.find((u) => u !== uid) ?? uid)

  // 同じ人どうしは比べないので，反対側と同じ人を選んだら左右を入れ替える
  const pick = (side: 'left' | 'right', u: string) => {
    if (side === 'left') {
      if (u === right) setRight(left)
      setLeft(u)
    } else {
      if (u === left) setLeft(right)
      setRight(u)
    }
  }

  const select = (side: 'left' | 'right', value: string) => (
    <select value={value} onChange={(e) => pick(side, e.target.value)} aria-label={side === 'left' ? '左に出す人' : '右に出す人'}>
      {members.map((u) => (
        <option key={u} value={u}>
          {label(u)}
        </option>
      ))}
    </select>
  )

  return (
    <section>
      <h3>分岐点の図</h3>
      <p>
        <small className="muted">
          どこが同じで，どこで道が分かれ，どこで合流したかを AI が対応づけた図です．正しい・誤り，どちらがよいかは表しません．
          対応づけが違うと思ったら，その場所について話し合ってください．
          分岐点と「なぜ」が書かれていないステップには AI が問いかけます．答え（理由）は本人が書き，ほかの参加者にも見えます．
        </small>
      </p>
      {members.length > 2 && (
        <p>
          {select('left', left)} と {select('right', right)} を比べる
        </p>
      )}
      <PairDiagram problemId={problem.id} uid={uid} left={left} right={right} label={label} />
    </section>
  )
}

export default ComparisonSection
