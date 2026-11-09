// 思考ステップの契約（shared/schema/）を lib/ に写す．
// Cloud Functions にデプロイされるのは server/ の中だけなので，ビルドのたびに写して使う
import { copyFileSync, mkdirSync } from 'node:fs'

const from = new URL('../../shared/schema/thought-steps.schema.json', import.meta.url)
const to = new URL('../lib/thought-steps.schema.json', import.meta.url)
mkdirSync(new URL('../lib/', import.meta.url), { recursive: true })
copyFileSync(from, to)
