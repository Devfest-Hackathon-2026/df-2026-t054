// 「全員が提出するまで他人の投稿は読めない」のルールのテスト（#13）．
// しくみは docs/decisions/011-hide-until-all-submitted.md．`npm test`（firebase/ で）でエミュレータを立てて動かす
// 投稿（下書き）と提出の分け方は docs/decisions/issue-70-confirm-submit.md
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, it } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { getMetadata, ref, uploadBytes } from 'firebase/storage'

const projectId = 'demo-gdgoc'
const problemId = 'p1'
const problemPath = `problems/${problemId}`

let env: RulesTestEnvironment

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
    storage: { rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8') },
  })
})

after(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.clearStorage()
})

const db = (uid: string) => env.authenticatedContext(uid).firestore()
const storage = (uid: string) => env.authenticatedContext(uid).storage()

const filePath = (uid: string) => `${problemPath}/posts/${uid}/1-a.png`
const textPost = (text = '解法') => ({ kind: 'text', text, createdAt: serverTimestamp() })

// ルールを通さずに problem と投稿・ステップ・ファイルを置く．提出済みの人は，ステップ化が終わった投稿を持つ
async function seed(memberUids: string[], submittedUids: string[]) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore()
    await setDoc(doc(fs, problemPath), {
      title: 't',
      body: 'b',
      ownerUid: memberUids[0],
      memberUids,
      submittedUids,
      createdAt: Timestamp.now(),
    })
    for (const uid of submittedUids) {
      const createdAt = Timestamp.now()
      await setDoc(doc(fs, problemPath, 'posts', uid), { kind: 'text', text: uid, createdAt })
      await setDoc(doc(fs, problemPath, 'steps', uid), { status: 'done', postCreatedAt: createdAt })
      await uploadBytes(ref(ctx.storage(), filePath(uid)), new Uint8Array([1]), { contentType: 'image/png' })
    }
  })
}

// 投稿（下書き）を書く（web/src/posts.ts の writePost と同じ形）
function writePost(uid: string, text = '解法') {
  return setDoc(doc(db(uid), problemPath, 'posts', uid), textPost(text))
}

// サーバーの代わりに，今の投稿のステップ化の結果を置く．stale なら前の版（別の時刻）の結果にする
async function seedSteps(uid: string, status = 'done', stale = false) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore()
    const post = await getDoc(doc(fs, problemPath, 'posts', uid))
    const postCreatedAt = stale ? Timestamp.fromMillis(0) : (post.get('createdAt') as Timestamp)
    await setDoc(doc(fs, problemPath, 'steps', uid), { status, postCreatedAt })
  })
}

// 「この内容で提出」: 自分の uid を submittedUids に足すだけ（web/src/posts.ts の submitPost と同じ形）
function submit(uid: string) {
  return updateDoc(doc(db(uid), problemPath), { submittedUids: arrayUnion(uid) })
}

// 提出の取り消し（web/src/posts.ts の withdrawSubmission と同じ形）
function withdraw(uid: string) {
  return updateDoc(doc(db(uid), problemPath), { submittedUids: arrayRemove(uid) })
}

// 投稿してステップ化が終わるまで進め，提出する
async function postAndSubmit(uid: string) {
  await assertSucceeds(writePost(uid))
  await seedSteps(uid)
  return submit(uid)
}

async function submittedUids() {
  let uids: string[] = []
  await env.withSecurityRulesDisabled(async (ctx) => {
    uids = (await getDoc(doc(ctx.firestore(), problemPath))).get('submittedUids') as string[]
  })
  return uids
}

describe('全員が提出する前', () => {
  beforeEach(() => seed(['a', 'b'], ['a']))

  it('本人は自分の投稿・ステップ・ファイルを読める', async () => {
    await assertSucceeds(getDoc(doc(db('a'), problemPath, 'posts', 'a')))
    await assertSucceeds(getDoc(doc(db('a'), problemPath, 'steps', 'a')))
    await assertSucceeds(getMetadata(ref(storage('a'), filePath('a'))))
  })

  it('ほかの参加者は投稿・ステップ・ファイルを読めない', async () => {
    await assertFails(getDoc(doc(db('b'), problemPath, 'posts', 'a')))
    await assertFails(getDocs(collection(db('b'), problemPath, 'posts')))
    await assertFails(getDoc(doc(db('b'), problemPath, 'steps', 'a')))
    await assertFails(getDocs(collection(db('b'), problemPath, 'steps')))
    await assertFails(getMetadata(ref(storage('b'), filePath('a'))))
  })

  it('提出した人は投稿を書き換えられない．提出を取り消せば出し直せる', async () => {
    await assertFails(writePost('a', '書き直し'))
    await assertSucceeds(withdraw('a'))
    await assertSucceeds(writePost('a', '書き直し'))
  })

  it('新しい人が参加できる', async () => {
    await assertSucceeds(updateDoc(doc(db('c'), problemPath), { memberUids: arrayUnion('c') }))
  })
})

describe('投稿（下書き）', () => {
  beforeEach(() => seed(['a', 'b'], []))

  it('参加者は提出しないまま投稿でき，何度でも出し直せる．投稿しただけでは提出にならない', async () => {
    await assertSucceeds(writePost('a'))
    await assertSucceeds(writePost('a', '書き直し'))
    await assertSucceeds(writePost('a', 'もう一度'))
    assert.deepEqual(await submittedUids(), [])
  })

  it('参加していない人は投稿できない', async () => {
    await assertFails(writePost('c'))
  })

  it('投稿と提出を同じバッチで書いても，ステップ化の前なので提出できない', async () => {
    const fs = db('a')
    const batch = writeBatch(fs)
    batch.set(doc(fs, problemPath, 'posts', 'a'), textPost())
    batch.update(doc(fs, problemPath), { submittedUids: arrayUnion('a') })
    await assertFails(batch.commit())
  })

  // バッチの中では get() は書く前の状態を返すので，前の投稿のステップが done なら提出の条件は通ってしまう．
  // 投稿のルールが getAfter() で「書いたあとも提出していない」を確かめて拒否する（PR #75 のレビュー）
  it('ステップが done の下書きがあっても，提出と投稿の書き換えを同じバッチで送ると拒否される', async () => {
    await assertSucceeds(writePost('a'))
    await seedSteps('a')
    const fs = db('a')
    const batch = writeBatch(fs)
    batch.update(doc(fs, problemPath), { submittedUids: arrayUnion('a') })
    batch.set(doc(fs, problemPath, 'posts', 'a'), textPost('提出と同時に書き換え'))
    await assertFails(batch.commit())
    assert.deepEqual(await submittedUids(), [])
  })

  it('最後の1人が提出と投稿の書き換えを同じバッチで送っても締め切られない', async () => {
    await assertSucceeds(postAndSubmit('a'))
    await assertSucceeds(writePost('b'))
    await seedSteps('b')
    const fs = db('b')
    const batch = writeBatch(fs)
    batch.update(doc(fs, problemPath), { submittedUids: arrayUnion('b') })
    batch.set(doc(fs, problemPath, 'posts', 'b'), textPost('提出と同時に書き換え'))
    await assertFails(batch.commit())
    assert.deepEqual(await submittedUids(), ['a'])
  })
})

describe('提出（この内容で提出）', () => {
  beforeEach(() => seed(['a', 'b'], []))

  it('ステップが done で今の投稿と同じ版なら提出できる', async () => {
    await assertSucceeds(postAndSubmit('a'))
    assert.deepEqual(await submittedUids(), ['a'])
  })

  it('投稿が無いと提出できない', async () => {
    await assertFails(submit('a'))
  })

  it('ステップがまだ無い・processing・failed のあいだは提出できない', async () => {
    await assertSucceeds(writePost('a'))
    await assertFails(submit('a'))
    await seedSteps('a', 'processing')
    await assertFails(submit('a'))
    await seedSteps('a', 'failed')
    await assertFails(submit('a'))
  })

  it('ステップが前の版の投稿のもの（出し直した直後）なら提出できない', async () => {
    await assertSucceeds(writePost('a'))
    await seedSteps('a', 'done', true)
    await assertFails(submit('a'))
  })

  it('ほかの人の uid は submittedUids に足せない', async () => {
    await assertSucceeds(writePost('a'))
    await seedSteps('a')
    await assertSucceeds(writePost('b'))
    await seedSteps('b')
    await assertFails(updateDoc(doc(db('a'), problemPath), { submittedUids: ['a', 'b'] }))
    await assertFails(updateDoc(doc(db('a'), problemPath), { submittedUids: ['b'] }))
  })

  it('参加していない人は提出できない（投稿とステップがあっても）', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), problemPath, 'posts', 'c'), { kind: 'text', text: 'c', createdAt: Timestamp.now() })
    })
    await seedSteps('c')
    await assertFails(submit('c'))
  })

  it('参加と提出を同じ更新でまとめて書けない', async () => {
    await assertFails(updateDoc(doc(db('a'), problemPath), { memberUids: arrayUnion('a'), submittedUids: ['a'] }))
  })

  it('一度提出した人は submittedUids にもう一度足せない', async () => {
    await assertSucceeds(postAndSubmit('a'))
    await assertFails(updateDoc(doc(db('a'), problemPath), { submittedUids: ['a', 'a'] }))
  })

  it('最後の1人が提出すると，ほかの人の投稿が読めるようになる', async () => {
    await assertSucceeds(postAndSubmit('a'))
    await assertFails(getDoc(doc(db('b'), problemPath, 'posts', 'a')))
    await assertSucceeds(postAndSubmit('b'))
    await assertSucceeds(getDoc(doc(db('b'), problemPath, 'posts', 'a')))
    await assertSucceeds(getDoc(doc(db('a'), problemPath, 'posts', 'b')))
  })
})

describe('提出の取り消し', () => {
  beforeEach(() => seed(['a', 'b', 'c'], ['a', 'b']))

  it('本人は締め切り前なら取り消せる', async () => {
    await assertSucceeds(withdraw('a'))
    assert.deepEqual(await submittedUids(), ['b'])
  })

  it('ほかの人の提出は取り消せない・提出していない人は取り消せない', async () => {
    await assertFails(updateDoc(doc(db('a'), problemPath), { submittedUids: ['a'] }))
    await assertFails(withdraw('c'))
  })
})

describe('全員が提出したあと', () => {
  beforeEach(() => seed(['a', 'b'], ['a', 'b']))

  it('参加者はほかの人の投稿・ステップ・ファイルを読める', async () => {
    await assertSucceeds(getDoc(doc(db('b'), problemPath, 'posts', 'a')))
    await assertSucceeds(getDocs(collection(db('b'), problemPath, 'posts')))
    await assertSucceeds(getDoc(doc(db('b'), problemPath, 'steps', 'a')))
    await assertSucceeds(getDocs(collection(db('b'), problemPath, 'steps')))
    await assertSucceeds(getMetadata(ref(storage('b'), filePath('a'))))
  })

  it('参加していない人は読めない', async () => {
    await assertFails(getDoc(doc(db('c'), problemPath, 'posts', 'a')))
    await assertFails(getDocs(collection(db('c'), problemPath, 'posts')))
    await assertFails(getDoc(doc(db('c'), problemPath, 'steps', 'a')))
    await assertFails(getMetadata(ref(storage('c'), filePath('a'))))
  })

  it('ログインしていない人は読めない', async () => {
    const anon = env.unauthenticatedContext()
    await assertFails(getDoc(doc(anon.firestore(), problemPath, 'posts', 'a')))
    await assertFails(getMetadata(ref(anon.storage(), filePath('a'))))
  })

  it('出し直しも提出の取り消しもできない（投稿は固まる）', async () => {
    await assertFails(writePost('a', '書き直し'))
    await assertFails(withdraw('a'))
  })

  it('新しいファイルは上げられない', async () => {
    const png = new Uint8Array([1])
    await assertFails(uploadBytes(ref(storage('a'), `${problemPath}/posts/a/2-b.png`), png, { contentType: 'image/png' }))
  })

  it('新しい人は参加できない（参加すると非公開に戻ってしまうため）', async () => {
    await assertFails(updateDoc(doc(db('c'), problemPath), { memberUids: arrayUnion('c') }))
  })
})

describe('参加者が1人のとき', () => {
  beforeEach(() => seed(['a'], []))

  it('作った人が招待の前に提出しても締め切られず，あとから参加できる', async () => {
    await assertSucceeds(postAndSubmit('a'))
    await assertSucceeds(updateDoc(doc(db('b'), problemPath), { memberUids: arrayUnion('b') }))
    await assertFails(getDoc(doc(db('b'), problemPath, 'posts', 'a')))
  })

  it('提出を取り消して出し直せる', async () => {
    await assertSucceeds(postAndSubmit('a'))
    await assertSucceeds(withdraw('a'))
    await assertSucceeds(writePost('a', '書き直し'))
  })
})

describe('前のルールで書いた投稿', () => {
  it('submittedUids に入っていない投稿は下書きとして扱い，ステップが done なら提出できる', async () => {
    await seed(['a', 'b'], [])
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), problemPath, 'posts', 'a'), { kind: 'text', text: '古い投稿', createdAt: Timestamp.now() })
    })
    await seedSteps('a')
    await assertSucceeds(submit('a'))
  })
})

describe('提出前のアップロード', () => {
  beforeEach(() => seed(['a', 'b'], []))

  // clearStorage() のあとも seed() で置いたファイルが残ることがあり，同じ名前だと「上書き禁止」で拒否されるので別の名前にする
  it('参加者は自分の場所に上げられる', async () => {
    const png = new Uint8Array([1])
    await assertSucceeds(uploadBytes(ref(storage('a'), `${problemPath}/posts/a/3-c.png`), png, { contentType: 'image/png' }))
  })

  it('参加していない人は上げられない', async () => {
    const png = new Uint8Array([1])
    await assertFails(uploadBytes(ref(storage('c'), `${problemPath}/posts/c/4-d.png`), png, { contentType: 'image/png' }))
  })
})

// 対応関係（#16）．書くのはサーバーだけなので，ルールを外して置く
describe('2人ずつの対応関係（comparisons）', () => {
  const pairPath = `${problemPath}/comparisons/a_b`
  async function seedComparison(submittedUids: string[]) {
    await seed(['a', 'b'], submittedUids)
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), pairPath), { status: 'processing' }))
  }

  it('全員が提出する前は，参加者も読めない', async () => {
    await seedComparison(['a'])
    await assertFails(getDoc(doc(db('a'), pairPath)))
    await assertFails(getDocs(collection(db('a'), problemPath, 'comparisons')))
  })

  it('全員が提出したあとは，参加者が読める', async () => {
    await seedComparison(['a', 'b'])
    await assertSucceeds(getDoc(doc(db('a'), pairPath)))
    await assertSucceeds(getDocs(collection(db('b'), problemPath, 'comparisons')))
  })

  it('参加していない人・ログインしていない人は読めない', async () => {
    await seedComparison(['a', 'b'])
    await assertFails(getDoc(doc(db('c'), pairPath)))
    await assertFails(getDocs(collection(db('c'), problemPath, 'comparisons')))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), pairPath)))
  })

  it('参加者も書けない（作る・書き換える・消す）', async () => {
    await seedComparison(['a', 'b'])
    await assertFails(setDoc(doc(db('a'), `${problemPath}/comparisons/a_c`), { status: 'done' }))
    await assertFails(updateDoc(doc(db('a'), pairPath), { status: 'done' }))
    await assertFails(deleteDoc(doc(db('a'), pairPath)))
  })
})

// 問いかけへの本人の理由（#20）．comparisons/a_b の a が uid 'a'，b が uid 'b'
describe('問いかけへの本人の理由（comparisons/{pairId}/answers）', () => {
  const pairPath = `${problemPath}/comparisons/a_b`
  const answerPath = (id: string) => `${pairPath}/answers/${id}`
  const answer = (uid: string, side: string, stepId: string, text = '最初に思いついたから') => ({
    uid,
    side,
    stepId,
    text,
    updatedAt: serverTimestamp(),
  })
  async function seedAnswerable(submittedUids = ['a', 'b'], status = 'done') {
    await seed(['a', 'b'], submittedUids)
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), pairPath), { status, uids: ['a', 'b'] }),
    )
  }

  it('本人は自分の側の問いに書ける・書き直せる・消せる', async () => {
    await seedAnswerable()
    await assertSucceeds(setDoc(doc(db('a'), answerPath('a_s1')), answer('a', 'a', 's1')))
    await assertSucceeds(setDoc(doc(db('a'), answerPath('a_s1')), answer('a', 'a', 's1', '書き直した')))
    await assertSucceeds(setDoc(doc(db('b'), answerPath('b_s2')), answer('b', 'b', 's2')))
    await assertSucceeds(deleteDoc(doc(db('a'), answerPath('a_s1'))))
  })

  it('参加者は読める．参加していない人は読めない', async () => {
    await seedAnswerable()
    await setDoc(doc(db('a'), answerPath('a_s1')), answer('a', 'a', 's1'))
    await assertSucceeds(getDoc(doc(db('b'), answerPath('a_s1'))))
    await assertSucceeds(getDocs(collection(db('b'), pairPath, 'answers')))
    await assertFails(getDoc(doc(db('c'), answerPath('a_s1'))))
    await assertFails(getDocs(collection(db('c'), pairPath, 'answers')))
  })

  it('相手の側の問いには書けない・相手の理由を消せない', async () => {
    await seedAnswerable()
    await assertFails(setDoc(doc(db('b'), answerPath('a_s1')), answer('b', 'a', 's1')))
    await assertFails(setDoc(doc(db('b'), answerPath('a_s1')), answer('a', 'a', 's1')))
    await setDoc(doc(db('a'), answerPath('a_s1')), answer('a', 'a', 's1'))
    await assertFails(deleteDoc(doc(db('b'), answerPath('a_s1'))))
    await assertFails(setDoc(doc(db('c'), answerPath('a_s1')), answer('c', 'a', 's1')))
  })

  it('ドキュメント ID と side・stepId が合わないと書けない', async () => {
    await seedAnswerable()
    await assertFails(setDoc(doc(db('a'), answerPath('a_s2')), answer('a', 'a', 's1')))
    await assertFails(setDoc(doc(db('a'), answerPath('c_s1')), answer('a', 'c', 's1')))
  })

  it('空・長すぎる・余計な項目・時刻が違うと書けない', async () => {
    await seedAnswerable()
    await assertFails(setDoc(doc(db('a'), answerPath('a_s1')), answer('a', 'a', 's1', '')))
    await assertFails(setDoc(doc(db('a'), answerPath('a_s1')), answer('a', 'a', 's1', 'あ'.repeat(1001))))
    await assertFails(setDoc(doc(db('a'), answerPath('a_s1')), { ...answer('a', 'a', 's1'), by: 'ai' }))
    await assertFails(setDoc(doc(db('a'), answerPath('a_s1')), { ...answer('a', 'a', 's1'), updatedAt: Timestamp.now() }))
  })

  it('対応関係ができる前・全員が提出する前は書けない', async () => {
    await seedAnswerable(['a', 'b'], 'processing')
    await assertFails(setDoc(doc(db('a'), answerPath('a_s1')), answer('a', 'a', 's1')))
    await env.clearFirestore()
    await seedAnswerable(['a'])
    await assertFails(setDoc(doc(db('a'), answerPath('a_s1')), answer('a', 'a', 's1')))
  })
})

// ステップへの質問のスレッド（#21）．データ構造は docs/decisions/issue-21-step-threads.md
describe('ステップへの質問と返信（threads）', () => {
  const threadPath = `${problemPath}/threads/t1`
  const replyPath = `${threadPath}/replies/r1`
  const thread = (uid: string, extra: Record<string, unknown> = {}) => ({
    uid,
    stepOwnerUid: 'a',
    stepId: 's1',
    text: 'なぜここで置換したの？',
    createdAt: serverTimestamp(),
    ...extra,
  })
  const reply = (uid: string, extra: Record<string, unknown> = {}) => ({
    uid,
    text: '式が対称だったから',
    createdAt: serverTimestamp(),
    ...extra,
  })

  it('全員が提出する前は，参加者も質問できず読めない', async () => {
    await seed(['a', 'b'], ['a'])
    await assertFails(setDoc(doc(db('a'), threadPath), thread('a')))
    await assertFails(getDocs(collection(db('a'), problemPath, 'threads')))
  })

  describe('全員が提出したあと', () => {
    beforeEach(() => seed(['a', 'b'], ['a', 'b']))

    it('参加者は質問・返信でき，ほかの参加者が読める', async () => {
      await assertSucceeds(setDoc(doc(db('b'), threadPath), thread('b')))
      await assertSucceeds(setDoc(doc(db('a'), replyPath), reply('a')))
      await assertSucceeds(getDocs(collection(db('a'), problemPath, 'threads')))
      await assertSucceeds(getDocs(collection(db('b'), threadPath, 'replies')))
    })

    it('参加していない人・ログインしていない人は読めず書けない', async () => {
      await assertSucceeds(setDoc(doc(db('b'), threadPath), thread('b')))
      await assertFails(getDocs(collection(db('c'), problemPath, 'threads')))
      await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), problemPath, 'threads')))
      await assertFails(setDoc(doc(db('c'), `${problemPath}/threads/t2`), thread('c')))
      await assertFails(setDoc(doc(db('c'), replyPath), reply('c')))
    })

    it('人になりすまして書けない', async () => {
      await assertFails(setDoc(doc(db('b'), threadPath), thread('a')))
      await assertSucceeds(setDoc(doc(db('b'), threadPath), thread('b')))
      await assertFails(setDoc(doc(db('b'), replyPath), reply('a')))
    })

    it('項目・長さ・時刻・ステップの持ち主が正しくないと書けない', async () => {
      await assertFails(setDoc(doc(db('b'), threadPath), thread('b', { text: '' })))
      await assertFails(setDoc(doc(db('b'), threadPath), thread('b', { text: 'あ'.repeat(1001) })))
      await assertFails(setDoc(doc(db('b'), threadPath), thread('b', { stepOwnerUid: 'c' })))
      await assertFails(setDoc(doc(db('b'), threadPath), thread('b', { stepId: '' })))
      await assertFails(setDoc(doc(db('b'), threadPath), thread('b', { createdAt: Timestamp.now() })))
      await assertFails(setDoc(doc(db('b'), threadPath), thread('b', { extra: 1 })))
      await assertSucceeds(setDoc(doc(db('b'), threadPath), thread('b', { text: 'あ'.repeat(1000) })))
      await assertFails(setDoc(doc(db('a'), replyPath), reply('a', { text: '' })))
      await assertFails(setDoc(doc(db('a'), replyPath), reply('a', { extra: 1 })))
    })

    it('無い質問には返信できない', async () => {
      await assertFails(setDoc(doc(db('a'), replyPath), reply('a')))
    })

    it('書き直せない．消せるのは自分が書いたものだけ', async () => {
      await assertSucceeds(setDoc(doc(db('b'), threadPath), thread('b')))
      await assertSucceeds(setDoc(doc(db('a'), replyPath), reply('a')))
      await assertFails(updateDoc(doc(db('b'), threadPath), { text: '書き直し' }))
      await assertFails(updateDoc(doc(db('a'), replyPath), { text: '書き直し' }))
      await assertFails(deleteDoc(doc(db('a'), threadPath)))
      await assertFails(deleteDoc(doc(db('b'), replyPath)))
      await assertSucceeds(deleteDoc(doc(db('a'), replyPath)))
      await assertSucceeds(deleteDoc(doc(db('b'), threadPath)))
    })
  })
})

describe('問題の削除（#72）', () => {
  const deleteProblem = (uid: string) => deleteDoc(doc(db(uid), problemPath))

  it('作った人は，自分しか参加していなければ消せる（提出のあとでも）', async () => {
    await seed(['a'], [])
    await assertSucceeds(deleteProblem('a'))
    await seed(['a'], ['a'])
    await assertSucceeds(deleteProblem('a'))
  })

  it('作った人以外・ログインしていない人は消せない', async () => {
    await seed(['a'], [])
    await assertFails(deleteProblem('c'))
    await assertFails(deleteDoc(doc(env.unauthenticatedContext().firestore(), problemPath)))
  })

  it('ほかの人が参加したあとは，作った人も参加した人も消せない', async () => {
    await seed(['a', 'b'], [])
    await assertFails(deleteProblem('a'))
    await assertFails(deleteProblem('b'))
    await seed(['a', 'b'], ['a', 'b'])
    await assertFails(deleteProblem('a'))
  })

  it('参加者が1人でも，作った人でなければ消せない', async () => {
    await seed(['b'], [])
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), problemPath), { ownerUid: 'a' }))
    await assertFails(deleteProblem('a'))
    await assertFails(deleteProblem('b'))
  })
})
