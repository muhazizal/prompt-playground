import OpenAI from 'openai'
import dotenv from 'dotenv'
dotenv.config()

function buildClassificationMessages({ labels = ['Positive', 'Negative', 'Neutral'], inputText }) {
	const system = `You are a precise labeling assistant. Apply definitions strictly. Return JSON {label, confidence, rationale}. Labels: ${labels.join(
		', '
	)}.`
	const examples = [
		{
			role: 'user',
			content: 'Loved the new update—battery lasts all day!',
		},
		{
			role: 'assistant',
			content: '{"label":"Positive","confidence":0.92,"rationale":"Praise and satisfaction."}',
		},
		{ role: 'user', content: 'App crashes every time I open settings.' },
		{
			role: 'assistant',
			content: '{"label":"Negative","confidence":0.95,"rationale":"Complaint about failure."}',
		},
	]
	return [
		{ role: 'system', content: system },
		...examples,
		{ role: 'user', content: `Text: "${inputText}"\nReturn JSON only.` },
	]
}

function buildTransformationMessages({ inputText, target = 'Bullet list' }) {
	const system =
		'You are a controlled rewriting assistant. Preserve meaning, obey the target format, no added claims.'
	const examples = [
		{ role: 'user', content: 'The meeting was kind of okay, we talked about several things.' },
		{
			role: 'assistant',
			content: [
				'- Outcome: Meeting was satisfactory',
				'- Topics: Budget review, timeline, risks',
				'- Next step: Share minutes',
			].join('\n'),
		},
	]
	return [
		{ role: 'system', content: system },
		...examples,
		{ role: 'user', content: `Target format: ${target}\nText: "${inputText}"` },
	]
}

function buildExtractionMessages({ inputText }) {
	const system =
		'You are an information extraction assistant. Return JSON exactly matching schema; unknown values must be null.'
	const schema =
		'{"company":string|null,"product":string|null,"price":number|null,"currency":string|null,"features":string[]}'
	const example = [
		{ role: 'user', content: 'Acme launches the Bolt smartwatch at $199 featuring GPS and NFC.' },
		{
			role: 'assistant',
			content:
				'{"company":"Acme","product":"Bolt","price":199,"currency":"USD","features":["GPS","NFC"]}',
		},
	]
	return [
		{ role: 'system', content: system },
		{ role: 'system', content: `Schema: ${schema}` },
		...example,
		{ role: 'user', content: `Text: "${inputText}"\nReturn JSON only.` },
	]
}

function buildReasoningMessages({ question }) {
	const system =
		'You are a structured reasoning assistant. Work internally, then output: answer + 3–5 concise steps (no inner monologue).'
	const example = [
		{ role: 'user', content: 'If a train travels 60 km/h for 2.5 hours, how far?' },
		{
			role: 'assistant',
			content:
				'answer: 150 km\nsteps:\n- speed × time → distance\n- 60 × 2.5 = 150\n- units are kilometers',
		},
	]
	return [
		{ role: 'system', content: system },
		...example,
		{
			role: 'user',
			content: `Question: ${question}\nOutput format:\nanswer: <short answer>\nsteps:\n- <concise step 1>\n- <concise step 2>\n- <concise step 3>`,
		},
	]
}

export async function runPromptEngineeringDemo({
	template = 'classify',
	model = 'gpt-4o-mini',
	temperature = 0.3,
	maxTokens = 200,
	inputText,
	labels,
	question,
} = {}) {
	const apiKey = process.env.OPENAI_API_KEY
	if (!apiKey) throw new Error('Missing OPENAI_API_KEY in environment or .env')
	const client = new OpenAI({ apiKey })

	let messages
	switch (template) {
		case 'classify':
			messages = buildClassificationMessages({
				labels: labels || ['Positive', 'Negative', 'Neutral'],
				inputText: inputText || 'I love the product!',
			})
			break
		case 'transform':
			messages = buildTransformationMessages({
				inputText: inputText || 'pls send report asap. thx',
				target: 'Formal',
			})
			break
		case 'extract':
			messages = buildExtractionMessages({
				inputText: inputText || 'Acme released the Flux v2 at $299 with LTE and GPS.',
			})
			break
		case 'reason':
			messages = buildReasoningMessages({
				question: question || 'A car moves at 45 km/h for 3 hours; distance?',
			})
			break
		default:
			throw new Error(`Unknown template: ${template}`)
	}

	const completion = await client.chat.completions.create({
		model,
		temperature,
		max_tokens: maxTokens,
		messages,
	})
	console.log(completion.choices[0]?.message?.content ?? '')
}

// Direct-run support
if (process.argv[1] && process.argv[1].endsWith('prompt_engineering.mjs')) {
	const args = process.argv.slice(2)
	const template = args[0] || 'classify'
	runPromptEngineeringDemo({ template }).catch((err) => {
		console.error('Error:', err?.message || String(err))
		process.exitCode = 1
	})
}
