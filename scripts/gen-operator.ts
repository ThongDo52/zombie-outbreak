/**
 * Creates the Endless Descent operator key: the wallet the game server uses to sign run tickets and settle runs.
 * The secret goes into `.env` as DESCENT_OPERATOR_KEY (server only, never VITE_) and is never printed.
 * Run once: `bun run scripts/gen-operator.ts`. Prints the public address so you can fund it with gas.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const ENV = new URL('../.env', import.meta.url).pathname
const text = existsSync(ENV) ? readFileSync(ENV, 'utf8') : ''
const existing = /^DESCENT_OPERATOR_KEY=(0x[0-9a-fA-F]{64})$/m.exec(text)
if (existing) {
  console.log('Operator already exists:', privateKeyToAccount(existing[1] as `0x${string}`).address)
} else {
  const key = generatePrivateKey()
  appendFileSync(ENV, `${text.endsWith('\n') || text === '' ? '' : '\n'}DESCENT_OPERATOR_KEY=${key}\n`)
  console.log('Operator created:', privateKeyToAccount(key).address)
}
