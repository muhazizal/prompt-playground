/**
 * Validate and normalize a strict JSON result shape returned by an LLM.
 * Expected schema: { intent: string, answer: string, sources: string[] }
 * Returns: { normalized, errors }
 */
export function validateResultShape(obj) {
  const errors = []
  const out = { intent: 'chat', answer: '', sources: [] }
  try {
    const parsed = typeof obj === 'string' ? JSON.parse(obj) : obj

    // Validate intent
    if (parsed && typeof parsed.intent === 'string') out.intent = parsed.intent
    else errors.push('intent missing')

    // Validate answer
    if (parsed && typeof parsed.answer === 'string') out.answer = parsed.answer
    else errors.push('answer missing')

    // Validate sources
    if (parsed && Array.isArray(parsed.sources)) out.sources = parsed.sources
    else errors.push('sources missing')
  } catch {
    errors.push('json parse failed')
  }
  return { normalized: out, errors }
}
