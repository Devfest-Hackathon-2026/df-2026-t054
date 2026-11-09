# 問題は `problems/{problemId}` に置き，参加者は配列で持ち，推測できない ID そのものを招待リンクにする（2026-11-07）

- 決めたこと:
  - Firestore のデータ構造（共有の契約）:
    ```
    problems/{problemId}        ← 自動 ID（20文字のランダム）
      title: string             ← 1〜100文字
      body: string              ← 1〜5000文字．プレーンテキスト（LaTeX の表示は後で決める）
      ownerUid: string          ← 作った人
      memberUids: string[]      ← 参加者（作った人を含む）
      submittedUids: string[]   ← 提出した人．作るときは空．#13 で使う
      createdAt: Timestamp      ← serverTimestamp()
    ```
  - 招待リンクは `/problems/{problemId}/join`．ログインした人がリンクを開いて「参加する」を押すと，`memberUids` に自分の uid を `arrayUnion` で足す
  - ルール（`firebase/firestore.rules`）: 作成は自分が owner かつ唯一の参加者のときだけ．`get` はログインしていれば可（参加前にタイトルを見せるため），`list` は自分が参加者のものだけ．更新は「自分の uid を `memberUids` の末尾に1つ足す」だけ許す
  - 一覧は `where('memberUids', 'array-contains', uid)` で取り，並べ替えは画面側でする（複合インデックスを作らないため）
  - 画面の切り替えはライブラリを入れず `location.pathname` と `history.pushState` で行う（`useRoute`）
  - ルールとエミュレータの設定は `firebase/firebase.json`（＋`firebase/.firebaserc`）に置き，Hosting の `web/firebase.json` とは分ける（010 でリポジトリ直下に移した）
    - エミュレータ: リポジトリ直下で `npx firebase-tools@15 emulators:start --only auth,firestore`，`web/.env` に `VITE_FIREBASE_EMULATOR=true` を書いて `npm run dev`
    - ルールの反映: リポジトリ直下で `npx firebase-tools@15 deploy --only firestore:rules`（CI では反映しない．レビュー後に人が行う）
- 理由:
  - #13 の「全員が出すまで見えない」をセキュリティルールで判定するには参加者数と提出者数が要る．ルールはサブコレクションの件数を数えられないので，problem ドキュメントの配列にする．`submittedUids` を最初から入れておけば #13 でデータを作り直さずに済む
  - problemId は推測できないので，それ自体を合言葉にすればサーバー（Cloud Run）なしでルールだけで参加を制御できる
  - ルーティングは画面が3つしかなく，Hosting は全パスを `index.html` に rewrite 済みなので自前で足りる
- 捨てた案とその理由:
  - 参加者をサブコレクション `problems/{id}/members/{uid}` にする: ルールで人数を数えられず，#13 が書けない
  - 招待トークンを別コレクション `invites/{token}` に置く: リンクを無効にできる利点はあるが，ルールとコードが増える．5日間の MVP では無効化は要らない
  - react-router を入れる: 依存が増える．画面が増えたらそのとき相談する
  - ルールを `web/firebase.json` から `../firebase/firestore.rules` で参照する: firebase-tools が「プロジェクトのディレクトリの外」として拒否する．`web/firebase.json` をリポジトリ直下に移すと CI のデプロイ手順も変わるので，`firebase/` に設定を分けた
- 承知のうえの弱さ: `get` を開けているので，problemId を知っていれば参加しなくても本文まで読める（画面では参加後にだけ出す）．投稿そのものは #13 で守る
- 残った論点（#13 で決める）: 全員が提出したあとに新しい人が参加すると，再び「全員提出前」に戻る．作った人が参加を締め切るなどの扱いが要る
- #13 でルールに足すもの: 今の `update` は「参加」しか許さない．提出（自分の uid を `submittedUids` に足す）や，作った人が参加を締め切る項目を足すときは，それぞれの更新を許す条件を `firebase/firestore.rules` に足す（`create` で許す項目の一覧 `keys` も合わせて直す）
