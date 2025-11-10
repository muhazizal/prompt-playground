import OpenAI, { toFile } from 'openai'

// Task-based default models
export const TASK_MODELS = {
	'text-generation': { label: 'Text Generation', value: 'gpt-4o-mini' },
	'image-generation': { label: 'Image Generation', value: 'gpt-image-1' },
	'image-vision': { label: 'Image Vision', value: 'gpt-4o-mini' }, // Use gpt-4o-mini for reliable vision
	'speech-to-text': { label: 'Speech → Text', value: 'whisper-1' },
	'text-to-speech': { label: 'Text → Speech', value: 'gpt-4o-mini-tts' },
}

/**
 * Create an OpenAI client from API key.
 * Reuses notes helper for consistency.
 */
export function getClient(apiKey) {
	if (!apiKey) throw new Error('Missing OPENAI_API_KEY')
	return new OpenAI({ apiKey })
}

/**
 * Model context window sizes (approximate). Defaults to 8192 if unknown.
 */
export function getModelContextWindow(model) {
	const M = String(model || '').toLowerCase()
	const MAP = {
		'gpt-4o-mini': 128000,
		'gpt-4o-mini-tts': 128000,
		'gpt-image-1': 8192,
		'whisper-1': 8192,
	}

	return MAP[M] || 8192
}

/**
 * Lightweight, deterministic overflow summarizer without extra LLM calls.
 * Produces up to 5 bullets using recent overflow messages.
 */
export function summarizeOverflowHeuristic(overflow, { maxBullets = 5, maxChars = 800 } = {}) {
	const items = Array.isArray(overflow) ? overflow : []

	if (items.length === 0) return ''

	const start = Math.max(0, items.length - maxBullets)
	const bullets = []

	for (let i = start; i < items.length; i++) {
		const m = items[i] || {}
		const role = m.role || 'user'
		let content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')
		content = content.replace(/\s+/g, ' ').trim()

		if (content.length > 180) content = content.slice(0, 176) + '…'

		bullets.push(`- ${role}: ${content}`)
	}

	const text = bullets.join('\n')
	return text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text
}

/**
 * List available chat-capable models. Falls back to defaults on error.
 */
export async function listModels() {
	return [
		TASK_MODELS['text-generation'],
		TASK_MODELS['image-generation'],
		TASK_MODELS['image-vision'],
		TASK_MODELS['speech-to-text'],
		TASK_MODELS['text-to-speech'],
	]
}

/**
 * Describe an image using a vision-capable chat model.
 */
export async function visionDescribe(
	client,
	{
		imageUrl,
		imageBase64,
		prompt = 'Describe the image in detail.',
		model = TASK_MODELS['image-vision'].value,
		maxTokens = 300,
		temperature = 0.2,
	} = {}
) {
	// Validate image input
	const dataUrlCandidate =
		typeof imageBase64 === 'string' && imageBase64
			? imageBase64.startsWith('data:')
				? imageBase64
				: `data:image/png;base64,${imageBase64}`
			: null
	const url = imageUrl || dataUrlCandidate

	if (!url) throw new Error('Missing imageUrl or imageBase64')

	// Run vision model completion
	const started = Date.now()
	const completion = await client.chat.completions.create({
		model,
		temperature,
		max_tokens: maxTokens,
		messages: [
			{ role: 'system', content: 'You are a helpful visual assistant.' },
			{
				role: 'user',
				content: [
					{ type: 'text', text: prompt },
					{ type: 'image_url', image_url: { url } },
				],
			},
		],
	})
	const durationMs = Date.now() - started
	const text = completion?.choices?.[0]?.message?.content || ''

	return { text, usage: completion?.usage || null, model, durationMs }
}

/**
 * Speech-to-Text transcription using Whisper.
 */
export async function speechToTextTranscribe(
	client,
	{ audioBase64, model = TASK_MODELS['speech-to-text'].value, language } = {}
) {
	if (!audioBase64 || typeof audioBase64 !== 'string') throw new Error('Missing audioBase64')

	const base64 = audioBase64.replace(/^data:[^;]+;base64,/, '')
	const buf = Buffer.from(base64, 'base64')

	const started = Date.now()
	const res = await client.audio.transcriptions.create({
		model,
		file: await toFile(buf, 'audio.mp3', { contentType: 'audio/mpeg' }),
		language,
	})
	const durationMs = Date.now() - started

	return { text: res?.text || '', model, durationMs }
}

/**
 * Text-to-Speech synthesis using gpt-4o-mini-tts.
 */
export async function textToSpeechSynthesize(
	client,
	{ text, model = TASK_MODELS['text-to-speech'].value, voice = 'alloy', format = 'mp3' } = {}
) {
	if (!text || typeof text !== 'string') throw new Error('Missing text')

	const started = Date.now()
	const audio = await client.audio.speech.create({
		model,
		voice,
		input: text,
	})
	const durationMs = Date.now() - started
	const buffer = Buffer.from(await audio.arrayBuffer())
	const audioBase64 = buffer.toString('base64')
	const contentType = format === 'wav' ? 'audio/wav' : 'audio/mpeg'

	return { audioBase64, contentType, model, durationMs }
}

/**
 * Image generation using gpt-image-1. Returns base64 PNG by default.
 */
export async function imageGenerate(
	client,
	{ prompt, model = TASK_MODELS['image-generation'].value, size = '1024x1024', format = 'png' } = {}
) {
	if (!prompt || typeof prompt !== 'string') throw new Error('Missing prompt')

	const started = Date.now()
	const res = await client.images.generate({
		model,
		prompt,
		size,
	})
	const durationMs = Date.now() - started
	const b64 = res?.data?.[0]?.b64_json || ''
	const imageBase64 = typeof b64 === 'string' ? b64 : ''
	const contentType = format === 'webp' ? 'image/webp' : 'image/png'

	return { imageBase64, contentType, model, durationMs, size }
}
