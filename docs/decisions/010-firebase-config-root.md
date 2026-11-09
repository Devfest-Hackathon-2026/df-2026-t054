# ルール・Functions・エミュレータの Firebase の設定をリポジトリ直下の `firebase.json` に移す（2026-11-08）

- 決めたこと:
  - `firebase/firebase.json` と `firebase/.firebaserc` をリポジトリ直下に移す．ルールのファイルは `firebase/` に置いたまま，`firebase.json` から `firebase/firestore.rules`・`firebase/storage.rules` を指す．Functions は `server` を指す
  - Firebase CLI（ルール・Functions のデプロイ，エミュレータ）はリポジトリ直下で動かす
    - エミュレータ: `npx firebase-tools@15 emulators:start --only auth,firestore,storage,functions`
    - デプロイ: `npx firebase-tools@15 deploy --only functions,firestore:rules,storage`（レビュー後に人が行う）．**必ず `--only` を付ける**．付けないと直下の設定にあるルールと Functions がまとめて本番に出る
  - Functions のコンテナイメージが Artifact Registry にたまって保存料金がかからないよう，古いイメージを消すポリシーを設定する．初回のデプロイで聞かれたら設定し，後からなら `npx firebase-tools@15 functions:artifacts:setpolicy --location asia-northeast1`（`--location` を付けないと既定の `us-central1` に設定される．Functions は `asia-northeast1` に置いている）
  - Hosting の `web/firebase.json` はそのまま．CLI は今いるディレクトリから一番近い `firebase.json` を使うので，`web/` で動く CI のプレビューデプロイは変わらない
- 理由:
  - クレジットが限られている（$20）ので，たまり続けるイメージの保存料金を避ける
  - #14 で `firebase/firebase.json` から `../server` を指したところ，デプロイで `../server is outside of project directory` と拒否された（エミュレータでは動いたので気づけなかった）．CLI は `firebase.json` のあるディレクトリの外のコードをデプロイしない
  - 直下に置けば，`server/` も `firebase/` もプロジェクトの中になり，1つの設定でエミュレータ（Firestore のトリガーで Functions を動かす）とデプロイの両方ができる
- 捨てた案とその理由:
  - `server/` に Functions 専用の `firebase.json` を置く: デプロイはできるが，エミュレータで Firestore と Functions が別々の設定になり，投稿をトリガーにした処理を手元で試せない
  - `firebase/` の中に `server/` へのシンボリックリンクを置く: アップロードのときにリンク先が含まれるか確かでない
  - `server/` を `firebase/` の下に移す: `CLAUDE.md` のディレクトリの役割が変わる
  - `web/firebase.json` も直下にまとめる: CI のデプロイ手順まで変わる（007 で避けた理由と同じ）
