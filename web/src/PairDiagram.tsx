import BranchDiagram from './BranchDiagram.tsx'
import QuestionAnswer from './QuestionAnswer.tsx'
import { answerId, deleteAnswer, saveAnswer, type Side } from './answers.ts'
import { pairId, type Segment } from './comparisons.ts'
import { useAnswers } from './useAnswers.ts'
import { useComparisons } from './useComparisons.ts'
import { useNow } from './useNow.ts'
import { useSteps } from './useSteps.ts'

// サーバーの上限（timeoutSeconds: 300）を少し超えたら止まったとみなす（StepsStatus と同じ）．ステップ化・対応づけの両方に使う．
// 締め切り後は作り直しの口が無いので，failed と同じく「分けられなかった」「比べられませんでした」と出す（docs/decisions/012-step-alignment.md）
const stuckMs = 6 * 60 * 1000

// 選んだ2人（left・right）の対応関係とステップを読んで，状態か分岐点の図を出す．
// AI の問いかけがあるステップには問いを出し，本人（uid）には理由を書く欄を出す（#20）
function PairDiagram({
  problemId,
  uid,
  left,
  right,
  label,
}: {
  problemId: string
  uid: string
  left: string
  right: string
  label: (uid: string) => string
}) {
  const { comparisons, error } = useComparisons(problemId)
  const leftSteps = useSteps(problemId, left)
  const rightSteps = useSteps(problemId, right)
  const now = useNow(30_000)
  const id = pairId(left, right)
  const answers = useAnswers(problemId, id)

  // 理由（answers）を読めなくても図は出す（ルールより先に画面だけ出たときなど）．そのときは問いの欄だけ隠す
  const loadError = error ?? leftSteps.error ?? rightSteps.error
  if (loadError) return <p role="alert">図を読み込めませんでした: {loadError.message}</p>
  if (
    comparisons === undefined ||
    leftSteps.steps === undefined ||
    rightSteps.steps === undefined ||
    answers.answers === undefined
  )
    return <p>読み込み中…</p>

  // processing のまま updatedAt から stuckMs 過ぎたら止まったとみなす（締め切り後は作り直しの口が無い）
  const isStuck = (status: string | undefined, updatedAt: { toMillis(): number } | null | undefined) =>
    status === 'processing' && updatedAt != null && now - updatedAt.toMillis() > stuckMs

  const failedSteps = [left, right].filter((_, i) => {
    const s = [leftSteps, rightSteps][i].steps
    return s?.status === 'failed' || isStuck(s?.status, s?.updatedAt)
  })
  if (failedSteps.length > 0)
    return <p role="alert">{failedSteps.map(label).join('・')}の投稿をステップに分けられなかったので，比べられません．</p>

  const comparison = comparisons.find((c) => c.id === id)
  if (!comparison) {
    const ready = leftSteps.steps?.status === 'done' && rightSteps.steps?.status === 'done'
    return <p role="status">{ready ? 'AI が2人のステップを対応づけています…' : 'ステップに分け終わるのを待っています…'}</p>
  }
  const stuck = isStuck(comparison.status, comparison.updatedAt)
  if (comparison.status === 'failed' || stuck)
    return <p role="alert">比べられませんでした．{comparison.status === 'failed' && comparison.error}</p>
  if (comparison.status === 'processing' || !comparison.alignment)
    return <p role="status">AI が2人のステップを対応づけています…</p>

  // 保存では a が uid の小さい方．左に出す人が b なら入れ替える
  const segments: Segment[] =
    comparison.uids[0] === left
      ? comparison.alignment.segments
      : comparison.alignment.segments.map((s) => ({ type: s.type, a: s.b, b: s.a }))

  const questions = comparison.questions?.questions ?? []
  const answerList = answers.answers
  // その人（who）のステップに付いた問いと理由．side は保存での a・b
  const extra = (who: string) => {
    if (answers.error) return undefined
    const side: Side = comparison.uids[0] === who ? 'a' : 'b'
    return (stepId: string) => {
      const question = questions.find((q) => q.side === side && q.stepId === stepId)
      if (!question) return null
      const answer = answerList.find((a) => a.side === side && a.stepId === stepId)
      return (
        <QuestionAnswer
          key={`${id}/${answerId(side, stepId)}`}
          question={question}
          answer={answer}
          canAnswer={who === uid}
          onSave={(text) => saveAnswer(problemId, id, uid, side, stepId, text)}
          onDelete={() => deleteAnswer(problemId, id, side, stepId)}
        />
      )
    }
  }

  return (
    <>
      {answers.error && (
        <p role="alert">
          <small>AI の問いかけと本人の理由を読み込めなかったので，図だけを出しています．</small>
        </p>
      )}
      <BranchDiagram
        segments={segments}
        left={{ label: label(left), steps: leftSteps.steps?.thoughtSteps?.steps ?? [], extra: extra(left) }}
        right={{ label: label(right), steps: rightSteps.steps?.thoughtSteps?.steps ?? [], extra: extra(right) }}
      />
    </>
  )
}

export default PairDiagram
