import { useState, type FormEvent } from 'react'
import { answerMaxLength, type Answer } from './answers.ts'
import type { StepQuestion } from './comparisons.ts'

// 1つのステップに付いた AI の問いかけと，本人が書いた理由．
// 設計原則: AI は問うだけ．理由は本人が書く（下書きや候補を AI に作らせない）．ほかの参加者には読むだけで出す
// 分岐点の問い（branch）は開いて出し，「なぜ」が空のステップへの問い（missing_why）は図が長くならないようたたむ（#60 の申し送り）．
// 理由が書かれていれば最初から開く
function QuestionAnswer({
  question,
  answer,
  canAnswer,
  onSave,
  onDelete,
}: {
  question: StepQuestion
  answer: Answer | undefined
  canAnswer: boolean
  onSave: (text: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [draft, setDraft] = useState(answer?.text ?? '')
  const [editing, setEditing] = useState(!answer)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 開いた・閉じたは利用者に任せ，あとで答えが変わっても勝手に開閉しない（最初の値だけ使う）
  const [initiallyOpen] = useState(question.kind === 'branch' || !!answer)

  const run = async (f: () => Promise<void>, after: () => void) => {
    setBusy(true)
    setError(null)
    try {
      await f()
      after()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const text = draft.trim()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (text) void run(() => onSave(text), () => setEditing(false))
  }
  const remove = () => {
    if (window.confirm('書いた理由を消しますか？'))
      void run(onDelete, () => {
        setDraft('')
        setEditing(true)
      })
  }

  return (
    <details open={initiallyOpen} className="ai-question">
      <summary>
        <small className="muted">
          {question.kind === 'branch' ? 'AI の問いかけ（分岐点）' : 'AI の問いかけ'}
          {answer && '・本人の理由あり'}
        </small>
      </summary>
      <div>{question.text}</div>
      {canAnswer && editing ? (
        <form onSubmit={submit}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={answerMaxLength}
            rows={3}
            aria-label="あなたの理由"
            placeholder="あなたの理由を書いてください"
            disabled={busy}
          />
          <button type="submit" disabled={busy || !text}>
            {busy ? '保存中…' : '保存'}
          </button>
          {answer && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(answer.text)
                setEditing(false)
              }}
            >
              やめる
            </button>
          )}
        </form>
      ) : answer ? (
        <div>
          <strong>本人の理由:</strong> <span className="pre-wrap">{answer.text}</span>
          {canAnswer && (
            <div>
              <button type="button" disabled={busy} onClick={() => setEditing(true)}>
                書き直す
              </button>
              <button type="button" disabled={busy} onClick={remove}>
                消す
              </button>
            </div>
          )}
        </div>
      ) : (
        <small className="muted">（本人はまだ答えていません）</small>
      )}
      {error && <p role="alert">保存できませんでした: {error}</p>}
    </details>
  )
}

export default QuestionAnswer
