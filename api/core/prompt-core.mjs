import fs from 'fs'
import path from 'path'
import { getClient as getNotesClient } from './notes-core.mjs'

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
 * Reuses notes-core helper for consistency.
 */
export function getClient(apiKey) {
	return getNotesClient(apiKey)
}

/**
 * Run chat completion for one or multiple temperatures.
 * Returns array of runs with choices, usage, and duration.
 */
export async function chatWithTemperatures(
	client,
	{
		prompt,
		model = 'gpt-4o-mini',
		temperature = 0.3,
		maxTokens = 200,
		n = 1,
		temperatures,
		baseMessages,
	} = {}
) {
	if (!prompt || typeof prompt !== 'string') {
		throw new Error('Missing prompt')
	}

	// Validate and normalize temperatures
	const tempsToRun =
		Array.isArray(temperatures) && temperatures.length > 0
			? temperatures.map(Number).filter((t) => !Number.isNaN(t))
			: [Number(temperature)]

	// Build messages with optional baseMessages (e.g., memory + system + user)
	const defaultMessages = [
		{ role: 'system', content: 'You are a helpful assistant.' },
		{ role: 'user', content: prompt },
	]
	const messages =
		Array.isArray(baseMessages) && baseMessages.length > 0 ? baseMessages : defaultMessages

	// Run completions for each temperature
	const runs = []

	for (const t of tempsToRun) {
		const started = Date.now()
		const completion = await client.chat.completions.create({
			model,
			temperature: t,
			n: Math.max(1, Number(n) || 1),
			max_tokens: maxTokens,
			messages,
		})
		const durationMs = Date.now() - started
		const choices = (completion.choices || []).map((c, idx) => ({
			index: idx,
			text: c?.message?.content ?? '',
		}))

		runs.push({ temperature: t, choices, usage: completion.usage || null, durationMs })
	}

	return { prompt, model, maxTokens, runs }
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
 * Summarize a sequence of chat messages into a compact system context string.
 * Returns a short summary suitable for inclusion as a system message.
 */
export async function summarizeMessages(
	client,
	messages,
	{ model = 'gpt-4o-mini', maxTokens = 200 } = {}
) {
	const asText = (Array.isArray(messages) ? messages : [])
		.map((m) => {
			const role = m?.role || 'user'
			const contentStr = Array.isArray(m?.content)
				? m.content.map((c) => (typeof c?.text === 'string' ? c.text : JSON.stringify(c))).join(' ')
				: String(m?.content ?? '')
			return `${role.toUpperCase()}: ${contentStr}`
		})
		.join('\n')

	const completion = await client.chat.completions.create({
		model,
		temperature: 0,
		max_tokens: maxTokens,
		messages: [
			{
				role: 'system',
				content:
					'You compress conversation history into key facts, decisions, intents, and unresolved questions. Be concise and factual. Return plain text only.',
			},
			{
				role: 'user',
				content: `Summarize the following conversation in 4-6 bullet points focusing on facts, context, and current objectives.\n\n${asText}`,
			},
		],
	})
	const summary = completion?.choices?.[0]?.message?.content || ''

	return String(summary || '').trim()
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
	const tmpDir = path.join(process.cwd(), 'cache')

	if (!fs.existsSync(tmpDir)) {
		fs.mkdirSync(tmpDir, { recursive: true })
	}

	const tmpPath = path.join(tmpDir, `stt-${Date.now()}.mp3`)
	fs.writeFileSync(tmpPath, buf)

	const started = Date.now()
	const res = await client.audio.transcriptions.create({
		model,
		file: fs.createReadStream(tmpPath),
		language,
	})
	const durationMs = Date.now() - started

	try {
		fs.unlinkSync(tmpPath)
	} catch {}

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
