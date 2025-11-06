/**
 * Heuristic planning: determines whether prompt likely needs weather or docs tools.
 */
export function planTools(prompt) {
	const txt = String(prompt || '').toLowerCase()
	const wantsWeather = /\b(weather|temperature|forecast|rain|sunny|wind)\b/.test(txt)
	const wantsDocs =
		/\b(note|notes|week|phase|doc|docs|project|agent|embedding|prompt|summarize|summary|title|titles|list|count|how\s+many)\b/.test(
			txt
		)

	return { wantsWeather, wantsDocs }
}

/**
 * LLM-based classification: returns { intent, args, confidence } with strict JSON parsing.
 */
export async function classifyIntent(client, prompt) {
	try {
		const sys = {
			role: 'system',
			content:
				'Return STRICT JSON: {"intent": string, "args": object, "confidence": number}. ' +
				'intents: ["list_notes","count_notes","titles","find_note","summarize_note","search_docs","weather","chat","multi"]. ' +
				'Do not include markdown or commentary.',
		}
		const user = { role: 'user', content: String(prompt || '') }
		const res = await client.chat.completions.create({
			model: 'gpt-4o-mini',
			temperature: 0,
			max_tokens: 120,
			response_format: { type: 'json_object' },
			messages: [sys, user],
		})
		const text = res?.choices?.[0]?.message?.content || '{}'
		const parsed = JSON.parse(text)
		const intent = typeof parsed.intent === 'string' ? parsed.intent : 'chat'
		const args = parsed && typeof parsed.args === 'object' ? parsed.args : {}
		const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0

		return { intent, args, confidence }
	} catch (e) {
		return { intent: 'chat', args: {}, confidence: 0 }
	}
}
