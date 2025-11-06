// Usage and cost helpers

export function normalizeUsage(u) {
  if (!u) return null
  return {
    promptTokens: u.promptTokens ?? u.prompt_tokens ?? null,
    completionTokens: u.completionTokens ?? u.completion_tokens ?? null,
    totalTokens: u.totalTokens ?? u.total_tokens ?? null,
  }
}

export function estimateCostUSD(usage, model = 'gpt-4o-mini') {
  if (!usage) return null
  const PRICES = {
    'gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.6 },
  }
  const p = PRICES[model] || PRICES['gpt-4o-mini']
  const pi = ((usage.prompt_tokens ?? usage.promptTokens) || 0) / 1_000_000
  const po = ((usage.completion_tokens ?? usage.completionTokens) || 0) / 1_000_000
  return Number((pi * p.inputPerM + po * p.outputPerM).toFixed(6))
}
