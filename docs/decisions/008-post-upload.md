# 投稿は `problems/{problemId}/posts/{uid}` に1人1つ置き，ファイルは Storage の同じ形のパスに置く（2026-11-07）

- 決めたこと:
  - Firestore のデータ構造（共有の契約）:
    ```
    problems/{problemId}/posts/{uid}   ← ドキュメント ID は投稿した人の uid（1人1投稿）
      kind: 'image' | 'text' | 'video'
      createdAt: Timestamp             ← serverTimestamp()
      // kind ごとに次のどれか1組だけを持つ
      imagePaths: string[]             ← image: Storage のパス．1〜5枚．並び順が思考ステップの imageIndex
      text: string                     ← text: LaTeX・コードなどの本文．1〜20000文字（表示は今はプレーンテキスト）
      videoPath: string                ← video: Storage のパス
      durationSec: number              ← video: 長さ（秒）．0 < x ≦ 60
    ```
  - Storage のパス: `problems/{problemId}/posts/{uid}/{時刻}-{ランダム}.{拡張子}`．名前は毎回新しく作り，上書き・削除は許さない
  - 上限: 画像は JPEG・PNG・WebP で1枚 10MB，5枚まで．動画は MP4・MOV・WebM で 100MB，60秒まで
  - ルール（`firebase/firestore.rules`・`firebase/storage.rules`）:
    - 書けるのは本人の場所だけで，その問題の参加者（`memberUids`）であること．Storage からは `firestore.get` で problem を読んで確かめる
    - 投稿の項目は kind ごとに決まった組だけ．`imagePaths`・`videoPath` は自分の Storage の場所を指していること
    - 読めるのは本人だけ（#13 で「全員提出後は参加者全員」に広げる）
    - 出し直し（上書き）は許す．提出後に固めるのは #13
  - 動画の長さはブラウザで `<video>` のメタデータを読んで確かめ，`durationSec` として保存し，Firestore のルールでも 60 以下を確かめる
  - ローカルの確認: リポジトリ直下で `npx firebase-tools@15 emulators:start --only auth,firestore,storage`（Storage エミュレータを追加．ポート 9199）
  - ルールの反映: リポジトリ直下で `npx firebase-tools@15 deploy --only firestore:rules,storage`（レビュー後に人が行う．初回は Storage から Firestore を読む権限の付与を聞かれる）
- 理由:
  - doc ID を uid にすると「1人1投稿」がルールで自然に守れ，#13 で「`submittedUids` と posts の uid」を突き合わせやすい
  - problem の下に置けば，#13 のルールで親の `memberUids`・`submittedUids` を1回の `get` で参照できる
  - 計画書の「動画は1分以内・低解像度」に合わせて 60 秒．100MB はスマホで撮った 1080p の1分動画が収まる程度
  - Storage のルールでは動画の長さを読めない．Cloud Run で長さを測る案はサーバーの実装が要るので，MVP ではブラウザで測り，値の範囲をルールで縛る
  - ファイル名を毎回変えると，出し直したときに古いファイルを上書きせず，Gemini の処理中に中身が変わることがない
- 捨てた案とその理由:
  - `posts/{自動ID}` に `authorUid` を持たせて1人で複数投稿: #13 のルールで「全員出したか」を数えにくい．比較 UI も1人1解法の前提
  - 投稿をトップレベルの `posts` コレクションに置く: ルールで問題の参加者かを確かめるのにパスから problemId を取れず，項目で持つ必要がある
  - LaTeX をファイルにして Storage に置く: 本文が小さく，Firestore に置けば読み込みが1回で済み，ステップの行番号とも対応させやすい
  - 動画の長さを Cloud Run（ffprobe）で測る: 確実だがサーバーの実装とデプロイが要る．#14 でサーバーを作るときに見直す
- 承知のうえの弱さ:
  - `durationSec` はクライアントが書く値なので，改ざんすれば長い動画も置ける（容量 100MB の上限は Storage のルールで守られる）
  - 出し直したときや，Storage に上げたあと Firestore への書き込みに失敗したときの古いファイルは消さずに残る
