# CI と PR プレビューは GitHub Actions 1本で回し，Workload Identity 連携で firebase-tools を直接呼ぶ（2026-11-06）

- 決めたこと:
  - `.github/workflows/web.yml` に2ジョブを置く
    - `check`: すべての PR と `main` への push で `web/` の lint（oxlint）・型チェック＋ビルド（`npm run build` = `tsc -b && vite build`）
    - `preview`: 同じリポジトリからの PR だけ，`check` のビルド成果物を `npx firebase-tools@15 hosting:channel:deploy pr-<番号> --expires 7d` でプレビューチャンネルに出し，URL を `gh pr comment --edit-last --create-if-none` で PR にコメント（push のたびに同じコメントを更新）
  - 認証は Workload Identity 連携（鍵なし）．`google-github-actions/auth@v3` が GitHub の OIDC トークンをサービスアカウント `github-actions-preview@gdgoc-hackathon-513704.iam.gserviceaccount.com` の短命な認証情報に交換する．GitHub Secrets は使わない
- 理由:
  - Issue #4 の指示（firebase-tools の `hosting:channel:deploy`）どおりで，001 の「Firebase CLI は依存に入れず npx で使う」とも揃う
  - 組織ポリシー `iam.disableServiceAccountKeyCreation` によりサービスアカウント鍵が作れない．Workload Identity 連携はこのポリシーのまま使え，漏れる鍵もない（Google 推奨）
  - 追加の Action は GitHub 公式（checkout / setup-node / upload・download-artifact）と Google 公式（auth）だけ
  - paths フィルタは付けず「PR ごとに CI が走る」を文字どおり満たし，後で必須チェックにしても詰まらない
- 捨てた案とその理由:
  - サービスアカウント鍵 JSON を GitHub Secret に置く: 最初はこれにしたが，組織ポリシーで鍵を作れなかった．ポリシーに例外を作るのはセキュリティ上の制約をわざわざ外すことになるのでやめた
  - `FirebaseExtended/action-hosting-deploy`: コメントまで自動だが，Action 依存が1つ増え，中で何をしているかが見えにくい
  - CI とプレビューを別ワークフローに分ける: ビルドを2回することになる

## Google Cloud 側の設定（設定済み・作り直すとき用）

プロジェクト `gdgoc-hackathon-513704`（番号 `306908875916`）．

1. Workload Identity プール `provide-to-github` に OIDC プロバイダ `github-actions` を作る
   - 発行元: `https://token.actions.githubusercontent.com`，オーディエンスはデフォルト
   - 属性マッピング: `google.subject = assertion.sub`，`attribute.repository = assertion.repository`
   - 属性条件: `assertion.repository == 'crab2424/gdgoc-2026'`（ほかのリポジトリから使わせない）
2. サービスアカウント `github-actions-preview` にプロジェクトのロール `Firebase Hosting 管理者`（roles/firebasehosting.admin），`API キー閲覧者`（roles/serviceusage.apiKeysViewer），`Service Usage ユーザー`（roles/serviceusage.serviceUsageConsumer）を付ける
   - Service Usage ユーザーがないと，firebase-tools が API の有効化を確認する段階で `Permission denied to get service [firebasehosting.googleapis.com]` の 403 になる
3. 同サービスアカウントに，プリンシパル `principalSet://iam.googleapis.com/projects/306908875916/locations/global/workloadIdentityPools/provide-to-github/attribute.repository/crab2424/gdgoc-2026` への `Workload Identity ユーザー`（roles/iam.workloadIdentityUser）を付ける

プロバイダ ID やプール名を変えたら，`web.yml` の `workload_identity_provider` も直す．
