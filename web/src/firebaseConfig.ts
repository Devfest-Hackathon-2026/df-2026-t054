// Firebase の Web 設定．値は web/.env から読む（web/.env.example を参照）．
// 公開前提の値で，アクセス制御はセキュリティルールで行う

// 設定の項目名 → 環境変数名．変数を足すときはここだけ直す
const envNames = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const

type ConfigKey = keyof typeof envNames
const entries = Object.entries(envNames) as [ConfigKey, string][]

export const firebaseConfig = Object.fromEntries(
  entries.map(([key, name]) => [key, import.meta.env[name] as string | undefined]),
) as Record<ConfigKey, string | undefined>

// 値が空の環境変数の名前（空でなければ Firebase を起動しない）
export const missingFirebaseEnv = entries
  .filter(([key]) => !firebaseConfig[key])
  .map(([, name]) => name)
