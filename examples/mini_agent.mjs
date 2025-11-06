import dotenv from 'dotenv'
dotenv.config()

import { runAgent } from '../api/core/agent.mjs'

// CLI usage: node examples/mini_agent.mjs --prompt "..." --sessionId id --model gpt-4o-mini --temp 0.2 --max 256 --chain debug
async function main() {
  const args = process.argv.slice(2)
  const get = (flag, def) => {
    const idx = args.indexOf(flag)
    if (idx !== -1 && args[idx + 1]) return args[idx + 1]
    return def
  }

  const prompt = get('--prompt', 'What is the weather and what did we learn last week?')
  const sessionId = get('--sessionId', 'mini-agent-demo')
  const model = get('--model', 'gpt-4o-mini')
  const temperature = Number(get('--temp', '0.2'))
  const maxTokens = Number(get('--max', '256'))
  const weatherQuery = get('--weather', '')
  const useMemory = get('--useMemory', 'true') !== 'false'
  const chain = get('--chain', '') // pass "debug" to emit messages + tool context

  try {
    const res = await runAgent(
      {
        prompt,
        sessionId,
        useMemory,
        model,
        temperature,
        maxTokens,
        weatherQuery,
      },
      { debug: chain === 'debug' }
    )
    console.log(JSON.stringify(res, null, 2))
  } catch (e) {
    console.error('[mini-agent] error:', e?.message || e)
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

