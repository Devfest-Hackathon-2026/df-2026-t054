// 投稿（problems/{problemId}/posts/{uid}）が作られた・出し直されたら，Gemini で思考ステップにして
// problems/{problemId}/steps/{uid} に保存する．データ構造は docs/decisions/009-steps-trigger.md
// 全員が提出したら（提出できるのはステップ化が終わってから．issue-70-confirm-submit.md），2人ずつの対応関係を
// problems/{problemId}/comparisons/{uidA}_{uidB} に保存する
// （docs/decisions/012-step-alignment.md）．同じドキュメントに，分岐点・why が空のステップへの問いかけも入れる（015）
// 思考ステップができたら，式変形を SymPy（Gemini のコード実行）で確かめて steps/{uid} の mathChecks に入れる（issue-22-sympy-check.md）
// 問題が消されたら，その下のサブコレクションと Storage のファイルを消す（issue-72-delete-problem.md）
import { GoogleGenAI } from '@google/genai'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, type Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions'
import { onDocumentDeleted, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { alignmentResponseSchema, buildAlignmentPrompt, normalizeAlignment, type ProblemText } from './alignment.ts'
import { schemaFor, type MathChecks, type StepAlignment, type ThoughtSteps } from './contract.ts'
import {
  assertMathChecks,
  buildPairsPrompt,
  buildRunParts,
  buildSympyCode,
  emptyMathChecks,
  normalizePairs,
  pairsResponseSchema,
  parseRunResult,
} from './mathChecks.ts'
import { baseModel, stepsModel } from './models.ts'
import {
  buildQuestionsPrompt,
  normalizeQuestions,
  questionsResponseSchema,
  questionTargets,
  templateQuestions,
} from './questions.ts'
import { buildParts, normalizeSteps, type Post } from './steps.ts'
import { classifyStepsError, retryOnceIfTemporary, STEPS_ERROR_MESSAGES } from './stepsError.ts'

initializeApp()
const db = getFirestore()

// 値は server/.env（.env.example を参照）．GOOGLE_CLOUD_PROJECT は Cloud Functions が自動で入れる
const region = process.env.FUNCTIONS_REGION || 'asia-northeast1'
const location = process.env.GOOGLE_CLOUD_LOCATION || 'global'
// ステップ化のモデルは投稿の種類ごと（stepsModel）．それ以外の呼び出しはテキストだけなので1つ（issue-50-model-per-kind.md）
const model = baseModel()

let ai: GoogleGenAI | undefined
function genai() {
  const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT
  ai ??= new GoogleGenAI({ vertexai: true, project, location })
  return ai
}

type StoredPost = Post & { createdAt: Timestamp | null }

// ステップ化の Gemini の呼び出し1回の上限．やり直し（1回）を含めて postToSteps の timeoutSeconds（300）に収める
const STEPS_ATTEMPT_TIMEOUT_MS = 130_000

export const postToSteps = onDocumentWritten(
  { document: 'problems/{problemId}/posts/{uid}', region, timeoutSeconds: 300, memory: '512MiB' },
  async (event) => {
    const before = event.data?.before.data() as StoredPost | undefined
    const after = event.data?.after.data() as StoredPost | undefined
    // 消されたとき・投稿の中身が変わっていないとき（出し直すと createdAt が変わる）は何もしない
    if (!after?.createdAt) return
    if (before?.createdAt && before.createdAt.isEqual(after.createdAt)) return

    const { problemId, uid } = event.params
    const postRef = db.doc(`problems/${problemId}/posts/${uid}`)
    const stepsRef = db.doc(`problems/${problemId}/steps/${uid}`)
    const postCreatedAt = after.createdAt
    // steps/{uid}.model には実際に使うモデルを書く
    const postModel = stepsModel(after.kind)

    // イベントが遅れて届き，もう新しい投稿に置き換わっていたら何もしない
    const isLatest = await db.runTransaction(async (tx) => {
      const post = await tx.get(postRef)
      if (!(post.get('createdAt') as Timestamp | undefined)?.isEqual(postCreatedAt)) return false
      tx.set(stepsRef, {
        status: 'processing',
        postCreatedAt,
        thoughtSteps: null,
        warnings: [],
        error: null,
        errorCode: null,
        model: postModel,
        updatedAt: FieldValue.serverTimestamp(),
      })
      return true
    })
    if (!isLatest) return

    let update: Record<string, unknown>
    try {
      const files = await fileInfos(after)
      const t0 = performance.now()
      // 429・5xx・時間切れは1回だけやり直す（issue-73）．関数の上限（300 秒）に2回分が収まるよう，1回ごとに時間を区切る
      const res = await retryOnceIfTemporary(
        () =>
          genai().models.generateContent({
            model: postModel,
            contents: [{ role: 'user', parts: buildParts(after, files) }],
            config: {
              responseMimeType: 'application/json',
              responseJsonSchema: schemaFor(after.kind),
              temperature: 0,
              httpOptions: { timeout: STEPS_ATTEMPT_TIMEOUT_MS },
            },
          }),
        {
          waitMs: 3000,
          onRetry: (err) =>
            logger.warn('ステップ化で一時的なエラーが出たのでやり直す', {
              problemId,
              uid,
              err: err instanceof Error ? err.message : String(err),
            }),
        },
      )
      const { result, warnings } = normalizeSteps(after, JSON.parse(res.text ?? ''))
      logger.info('ステップ化した', {
        problemId,
        uid,
        kind: after.kind,
        model: postModel,
        steps: result.steps.length,
        ms: Math.round(performance.now() - t0),
        usage: res.usageMetadata,
        warnings,
      })
      update = { status: 'done', thoughtSteps: result, warnings }
    } catch (err) {
      // Error をそのまま渡すと {} になることがあるので，stack を文字列にする
      const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)
      const errorCode = classifyStepsError(err)
      logger.error('ステップ化に失敗した', { problemId, uid, kind: after.kind, model: postModel, errorCode, err: detail })
      // 画面に出す文言は理由の分類ごとに決めたものだけ．内部のエラーの中身は出さない（ログで見る）
      update = { status: 'failed', errorCode, error: STEPS_ERROR_MESSAGES[errorCode] }
    }

    // 処理中に出し直されていたら，古い投稿の結果で上書きしない（新しい投稿の処理に任せる）
    await db.runTransaction(async (tx) => {
      const [post, steps] = await Promise.all([tx.get(postRef), tx.get(stepsRef)])
      const current = post.get('createdAt') as Timestamp | undefined
      const processing = steps.get('postCreatedAt') as Timestamp | undefined
      if (!current?.isEqual(postCreatedAt) || !processing?.isEqual(postCreatedAt)) return
      tx.update(stepsRef, { ...update, updatedAt: FieldValue.serverTimestamp() })
    })
  },
)

/** 投稿のファイル（Storage のパス）ごとに，Gemini に渡す gs:// の URI と MIME タイプを調べる */
async function fileInfos(post: Post) {
  const paths = post.kind === 'image' ? post.imagePaths : post.kind === 'video' ? [post.videoPath] : []
  const bucket = getStorage().bucket(process.env.GCS_BUCKET || undefined)
  const files = new Map<string, { uri: string; mimeType: string }>()
  for (const path of paths) {
    const [meta] = await bucket.file(path).getMetadata()
    if (!meta.contentType) throw new Error(`MIME タイプがない: ${path}`)
    files.set(path, { uri: `gs://${bucket.name}/${path}`, mimeType: meta.contentType })
  }
  return files
}

type StoredSteps = {
  status: 'processing' | 'done' | 'failed'
  postCreatedAt: Timestamp
  thoughtSteps: ThoughtSteps | null
  mathCheckStatus?: 'processing' | 'done' | 'failed'
}
type StoredProblem = ProblemText & { memberUids: string[]; submittedUids: string[] }

/** 全員が提出したか．firebase/firestore.rules・firebase/storage.rules・web/src/problems.ts と揃える（011） */
const allSubmitted = (p: StoredProblem) =>
  p.memberUids.length >= 2 && p.submittedUids.length === p.memberUids.length

// 最後の1人が「この内容で提出」を押して全員がそろったとき．提出はステップが done のときしかできないので（ルール），
// 締め切られた時点で全員のステップがそろっている
export const problemToComparisons = onDocumentUpdated(
  { document: 'problems/{problemId}', region, timeoutSeconds: 300, memory: '512MiB' },
  async (event) => {
    const before = event.data?.before.data() as StoredProblem | undefined
    const after = event.data?.after.data() as StoredProblem | undefined
    // 締め切られた瞬間（全員そろっていなかった → そろった）だけ動く
    if (!after || !allSubmitted(after) || (before && allSubmitted(before))) return
    await compareAll(event.params.problemId, after)
  },
)

// ステップが done になったとき．今のルールでは締め切り後にステップが変わることはないが，
// 前のルール（投稿＝提出）で締め切られ，ステップ化があとから終わった問題のために残す
export const stepsToComparisons = onDocumentWritten(
  { document: 'problems/{problemId}/steps/{uid}', region, timeoutSeconds: 300, memory: '512MiB' },
  async (event) => {
    const before = event.data?.before.data() as StoredSteps | undefined
    const after = event.data?.after.data() as StoredSteps | undefined
    // 新しく done になったときだけ動く（同じ投稿の結果のまま他の項目が変わったときは何もしない）
    if (after?.status !== 'done') return
    if (before?.status === 'done' && before.postCreatedAt?.isEqual(after.postCreatedAt)) return

    const { problemId } = event.params
    const problem = (await db.doc(`problems/${problemId}`).get()).data() as StoredProblem | undefined
    // 全員が提出するまでは作らない．そろうと締め切られ（011），投稿もステップも変わらなくなる
    if (!problem || !allSubmitted(problem)) return
    await compareAll(problemId, problem)
  },
)

/**
 * 全員のうち，ステップが done の人どうしの組をすべて作る（作り済みの組は compare が飛ばす）．
 * 2つのトリガーから重ねて呼ばれても，compare のトランザクションで1組を作るのは1回だけ
 */
async function compareAll(problemId: string, problem: StoredProblem) {
  const uids = [...problem.memberUids].sort()
  const snaps = await db.getAll(...uids.map((u) => db.doc(`problems/${problemId}/steps/${u}`)))
  const done = new Map<string, StoredSteps & { thoughtSteps: ThoughtSteps }>()
  snaps.forEach((snap, i) => {
    const s = snap.data() as StoredSteps | undefined
    if (s?.status === 'done' && s.thoughtSteps) done.set(uids[i], { ...s, thoughtSteps: s.thoughtSteps })
  })
  const ready = uids.filter((u) => done.has(u))
  const pairs = ready.flatMap((a, i) => ready.slice(i + 1).map((b) => [a, b] as const))
  await Promise.all(pairs.map(([a, b]) => compare(problemId, problem, [a, done.get(a)!], [b, done.get(b)!])))
}

/** 2人のステップの対応関係を作って保存する．同じ投稿どうしの結果がもうあれば何もしない */
async function compare(
  problemId: string,
  problem: ProblemText,
  [uidA, a]: [string, StoredSteps & { thoughtSteps: ThoughtSteps }],
  [uidB, b]: [string, StoredSteps & { thoughtSteps: ThoughtSteps }],
) {
  const ref = db.doc(`problems/${problemId}/comparisons/${uidA}_${uidB}`)
  // イベントは重ねて届くことがあるので，トランザクションで「作る係」を1つに決める
  const claimed = await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref)
    const ts = (k: string) => cur.get(k) as Timestamp | undefined
    if (ts('aPostCreatedAt')?.isEqual(a.postCreatedAt) && ts('bPostCreatedAt')?.isEqual(b.postCreatedAt)) return false
    tx.set(ref, {
      status: 'processing',
      uids: [uidA, uidB],
      aPostCreatedAt: a.postCreatedAt,
      bPostCreatedAt: b.postCreatedAt,
      alignment: null,
      questions: null,
      warnings: [],
      error: null,
      model,
      updatedAt: FieldValue.serverTimestamp(),
    })
    return true
  })
  if (!claimed) return

  const aIds = a.thoughtSteps.steps.map((s) => s.id)
  const bIds = b.thoughtSteps.steps.map((s) => s.id)
  let update: Record<string, unknown>
  try {
    const t0 = performance.now()
    const res = await genai().models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: buildAlignmentPrompt(problem, a.thoughtSteps, b.thoughtSteps) }] }],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: alignmentResponseSchema(aIds, bIds),
        temperature: 0,
      },
    })
    const { result, warnings } = normalizeAlignment(aIds, bIds, JSON.parse(res.text ?? ''))
    logger.info('対応関係を作った', {
      problemId,
      uids: [uidA, uidB],
      segments: result.segments.map((s) => s.type),
      ms: Math.round(performance.now() - t0),
      usage: res.usageMetadata,
      warnings,
    })
    const q = await askQuestions(problem, a.thoughtSteps, b.thoughtSteps, result, { problemId, uids: [uidA, uidB] })
    update = { status: 'done', alignment: result, questions: q.result, warnings: [...warnings, ...q.warnings] }
  } catch (err) {
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)
    logger.error('対応関係を作れなかった', { problemId, uids: [uidA, uidB], err: detail })
    update = { status: 'failed', error: '2人の解き方を比べられませんでした．' }
  }
  await ref.update({ ...update, updatedAt: FieldValue.serverTimestamp() })
}

/**
 * 分岐点・why が空のステップへの問いかけを作る．Gemini を呼べない・返り値が使えないときは，
 * 決まった文の問いにする（対応関係は作れているので，比べる画面を止めない）
 */
async function askQuestions(
  problem: ProblemText,
  a: ThoughtSteps,
  b: ThoughtSteps,
  alignment: StepAlignment,
  log: Record<string, unknown>,
) {
  const targets = questionTargets(alignment, a, b)
  if (targets.length === 0) return { result: templateQuestions([]), warnings: [] }
  const ids = (t: ThoughtSteps) => t.steps.map((s) => s.id)
  try {
    const t0 = performance.now()
    const res = await genai().models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: buildQuestionsPrompt(problem, a, b, alignment, targets) }] }],
      config: { responseMimeType: 'application/json', responseJsonSchema: questionsResponseSchema(targets), temperature: 0 },
    })
    const q = normalizeQuestions(targets, ids(a), ids(b), JSON.parse(res.text ?? ''))
    logger.info('問いかけを作った', {
      ...log,
      questions: q.result.questions.map((x) => `${x.side}:${x.stepId}:${x.kind}:${x.by}`),
      ms: Math.round(performance.now() - t0),
      usage: res.usageMetadata,
      warnings: q.warnings,
    })
    return q
  } catch (err) {
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)
    logger.error('問いかけを作れなかったので決まった文にした', { ...log, err: detail })
    return { result: templateQuestions(targets), warnings: ['問いかけを Gemini で作れなかったので，すべて決まった文にした'] }
  }
}

export const stepsToMathChecks = onDocumentWritten(
  { document: 'problems/{problemId}/steps/{uid}', region, timeoutSeconds: 300, memory: '512MiB' },
  async (event) => {
    const before = event.data?.before.data() as StoredSteps | undefined
    const after = event.data?.after.data() as StoredSteps | undefined
    // 新しく done になったときだけ動く（自分が mathChecks を書いたときも，同じ投稿の done のままなので何もしない）
    if (after?.status !== 'done' || !after.thoughtSteps) return
    if (before?.status === 'done' && before.postCreatedAt?.isEqual(after.postCreatedAt)) return

    const { problemId, uid } = event.params
    const ref = db.doc(`problems/${problemId}/steps/${uid}`)
    const { postCreatedAt, thoughtSteps } = after
    // イベントは重ねて届くことがあるので，トランザクションで「確かめる係」を1つに決める
    const claimed = await db.runTransaction(async (tx) => {
      const cur = await tx.get(ref)
      const current = cur.get('status') === 'done' && (cur.get('postCreatedAt') as Timestamp | undefined)?.isEqual(postCreatedAt)
      if (!current || cur.get('mathCheckStatus')) return false
      tx.update(ref, { mathCheckStatus: 'processing', mathChecks: null })
      return true
    })
    if (!claimed) return

    const log = { problemId, uid }
    let update: Record<string, unknown>
    try {
      const problem = (await db.doc(`problems/${problemId}`).get()).data() as ProblemText | undefined
      const { result, warnings } = await checkMath(problem ?? { title: '', body: '' }, thoughtSteps, log)
      update = {
        mathCheckStatus: 'done',
        mathChecks: result,
        ...(warnings.length && { warnings: FieldValue.arrayUnion(...warnings.map((w) => `式変形の確認: ${w}`)) }),
      }
    } catch (err) {
      const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)
      logger.error('式変形を確かめられなかった', { ...log, err: detail })
      // 参考の情報なので，失敗しても思考ステップはそのまま見せる．画面は確認結果を出さない
      update = { mathCheckStatus: 'failed', mathChecks: null }
    }

    // 確かめている間に出し直されていたら，古い投稿の結果を書かない（出し直すと postToSteps がドキュメントを作り直す）
    await db.runTransaction(async (tx) => {
      const cur = await tx.get(ref)
      if (!(cur.get('postCreatedAt') as Timestamp | undefined)?.isEqual(postCreatedAt)) return
      if (cur.get('mathCheckStatus') !== 'processing') return
      tx.update(ref, update)
    })
  },
)

/**
 * 式変形を確かめる．1回目の呼び出しで Gemini に式の組を写させ，2回目でこちらが作った SymPy のコードを
 * Gemini のコード実行で動かして，その出力から結果を作る
 */
async function checkMath(
  problem: ProblemText,
  steps: ThoughtSteps,
  log: Record<string, unknown>,
): Promise<{ result: MathChecks; warnings: string[] }> {
  const stepIds = steps.steps.map((s) => s.id)
  const t0 = performance.now()
  const res = await genai().models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: buildPairsPrompt(problem, steps) }] }],
    config: { responseMimeType: 'application/json', responseJsonSchema: pairsResponseSchema(stepIds), temperature: 0 },
  })
  const { pairs, warnings } = normalizePairs(stepIds, JSON.parse(res.text ?? ''))
  if (pairs.length === 0) {
    logger.info('式変形が無かった', { ...log, ms: Math.round(performance.now() - t0), usage: res.usageMetadata, warnings })
    return { result: emptyMathChecks(), warnings }
  }

  const code = buildSympyCode(pairs)
  const runOnce = async () => {
    const run = await genai().models.generateContent({
      model,
      contents: [{ role: 'user', parts: buildRunParts(code) }],
      config: { tools: [{ codeExecution: {} }], temperature: 0 },
    })
    return { run, parsed: parseRunResult(pairs, code, run.candidates?.[0]?.content?.parts ?? []) }
  }
  // Gemini がコードを実行しない・書き換えることがあるので，1回だけやり直す
  const { run, parsed } = await runOnce().catch((err: unknown) => {
    logger.warn('SymPy のコードの出力が取れなかったのでやり直す', { ...log, err: err instanceof Error ? err.message : String(err) })
    return runOnce()
  })
  assertMathChecks(parsed.result, stepIds)
  logger.info('式変形を確かめた', {
    ...log,
    checks: parsed.result.checks.map((c) => `${c.stepId}:${c.result}`),
    ms: Math.round(performance.now() - t0),
    usage: [res.usageMetadata, run.usageMetadata],
    warnings: [...warnings, ...parsed.warnings],
  })
  return { result: parsed.result, warnings: [...warnings, ...parsed.warnings] }
}

// 問題（problems/{problemId}）が消されたら，投稿・ステップなどのサブコレクションと Storage のファイルを消す．
// Firestore はドキュメントを消してもサブコレクションを消さず，steps はブラウザから書けないのでここで消す．
// 消せるのは作った人が1人で参加しているときだけ（firebase/firestore.rules）なので，ほかの人のデータは無い
export const deleteProblemData = onDocumentDeleted(
  { document: 'problems/{problemId}', region, timeoutSeconds: 300 },
  async (event) => {
    const { problemId } = event.params
    const bucket = getStorage().bucket(process.env.GCS_BUCKET || undefined)
    // 処理中のステップ化・式変形の確認は，結果を書く前に投稿・ステップがあるかを確かめるので，消したあとに結果を書き戻さない
    // （消すのとほぼ同時に投稿していたときだけ，processing のステップが残ることがある．画面からは届かないので害はない）
    await Promise.all([
      db.recursiveDelete(db.doc(`problems/${problemId}`)),
      bucket.deleteFiles({ prefix: `problems/${problemId}/` }),
    ])
    logger.info('消された問題のデータを消した', { problemId })
  },
)
