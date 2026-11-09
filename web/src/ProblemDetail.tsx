import { useState } from 'react'
import ComparisonSection from './ComparisonSection.tsx'
import OthersSection from './OthersSection.tsx'
import PostSection from './PostSection.tsx'
import { canDeleteProblem, deleteProblem, inviteUrl, type Problem } from './problems.ts'
import { navigate } from './useRoute.ts'

// closed: 締め切られたか．サーバーで確定した状態で決めたもの（useProblem）．
// problem はローカルの書き込みも反映した状態なので，isAllSubmitted(problem) では判断しない
function ProblemDetail({ problem, uid, closed }: { problem: Problem; uid: string; closed: boolean }) {
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)
  const url = inviteUrl(problem.id)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // 消したあとは一覧へ．ほかの人が参加したあとはルールで拒否される（docs/decisions/issue-72-delete-problem.md）
  const remove = () => {
    if (!window.confirm(`「${problem.title}」を削除します．あなたの投稿も消え，元に戻せません．よろしいですか？`)) return
    setDeleteError(null)
    setDeleting(true)
    deleteProblem(problem.id, uid)
      .then(() => navigate('/'))
      .catch((err: unknown) => {
        setDeleteError(`削除できませんでした: ${err instanceof Error ? err.message : String(err)}`)
        setDeleting(false)
      })
  }

  const copy = () => {
    navigator.clipboard.writeText(url).then(
      () => setCopied('ok'),
      () => setCopied('failed'),
    )
  }

  return (
    <article>
      <h2>{problem.title}</h2>
      <p className="pre-wrap">{problem.body}</p>
      <p>
        参加者 {problem.memberUids.length} 人・提出 {problem.submittedUids.length} 人（下書きは数えません）
        {closed ? '（全員が提出しました．ほかの人の投稿を読めます）' : '（全員が提出するまで，ほかの人の投稿は読めません）'}
      </p>
      {/* 締め切り後はページが長くなるので，各節へ飛べる目次を出す */}
      {closed && (
        <nav aria-label="このページの目次">
          <ul>
            <li>
              <a href="#mine">自分の解法</a>
            </li>
            <li>
              <a href="#comparison">分岐点の図</a>
            </li>
            <li>
              <a href="#others">ほかの参加者の解法</a>
            </li>
          </ul>
        </nav>
      )}
      <div id="mine" className="card">
        <PostSection
          problemId={problem.id}
          uid={uid}
          submitted={problem.submittedUids.includes(uid)}
          closed={closed}
          memberUids={problem.memberUids}
        />
      </div>
      {/* 提出前はルールで読めないので出さない（docs/decisions/011-hide-until-all-submitted.md）．
          並びは 自分の解法 → 分岐点の図 → ほかの参加者の解法（図で分岐点を見てから，各人の詳細を下で読む） */}
      {closed && (
        <div id="comparison" className="card">
          <ComparisonSection problem={problem} uid={uid} />
        </div>
      )}
      {closed && (
        <div id="others" className="card">
          <OthersSection problem={problem} uid={uid} />
        </div>
      )}
      <section className="card">
        <h3>招待リンク</h3>
        <p>
          このリンクを開いた人は，ログインするとこの問題に参加できます．
          {closed && '（全員が提出したので，今は締め切られています）'}
        </p>
        <p>
          <input value={url} readOnly size={60} onFocus={(e) => e.target.select()} aria-label="招待リンク" />{' '}
          <button type="button" onClick={copy}>
            コピー
          </button>
        </p>
        {copied === 'ok' && <p role="status">コピーしました</p>}
        {copied === 'failed' && <p role="alert">コピーできませんでした．上の欄から手で選んでコピーしてください．</p>}
      </section>
      {canDeleteProblem(problem, uid) && (
        // 招待リンクや提出の操作と同じ並びに見えないよう，別のカードにして区切る
        <section className="card">
          <h3>この問題を削除</h3>
          <p>まだほかの人が参加していないので削除できます．参加したあとは，その人の解法まで消えてしまうので削除できません．</p>
          <p>
            <button type="button" className="danger" onClick={remove} disabled={deleting}>
              この問題を削除
            </button>
          </p>
          {deleteError && <p role="alert">{deleteError}</p>}
        </section>
      )}
    </article>
  )
}

export default ProblemDetail
