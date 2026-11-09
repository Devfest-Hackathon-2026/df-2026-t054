import OtherPost from './OtherPost.tsx'
import type { Problem } from './problems.ts'

// 全員が提出したあとの「ほかの参加者の解法」．名前は保存していないので，#17 の図と同じく「参加者N」（参加順）で出す
function OthersSection({ problem, uid }: { problem: Problem; uid: string }) {
  const others = problem.memberUids.filter((u) => u !== uid)
  const viewer = { uid, memberUids: problem.memberUids }

  return (
    <section>
      <h3>ほかの参加者の解法</h3>
      {others.map((u) => (
        <OtherPost
          key={u}
          problemId={problem.id}
          uid={u}
          label={`参加者${problem.memberUids.indexOf(u) + 1}`}
          viewer={viewer}
        />
      ))}
    </section>
  )
}

export default OthersSection
