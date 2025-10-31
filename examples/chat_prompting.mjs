import OpenAI from 'openai'
import dotenv from 'dotenv'
dotenv.config()

const messagesMap = {
	role: [
		{
			role: 'system',
			content: 'You are a concise AI tutor. Use plain language and bullet points.',
		},
		{ role: 'user', content: 'Explain the difference between tokens and words in one sentence.' },
	],
	iter: [
		{ role: 'system', content: 'You are a structured reasoning assistant' },
		{
			role: 'user',
			content:
				'Given this draft, ask one clarifying question, then propose an improved outline in JSON with keys: question, outline[].',
		},
	],
	embed: [
		{
			role: 'user',
			content:
				'Given these 5 docs, embed and rank by similarity to my query; return the top 2 titles and a 1-sentence rationale each.',
		},
	],
}

export async function runChatDemo({
	model = 'gpt-4o-mini',
	temperature = 0.3,
	maxTokens = 100,
	mode = 'role', // role, iter, embed
} = {}) {
	const apiKey = process.env.OPENAI_API_KEY
	if (!apiKey) throw new Error('Missing OPENAI_API_KEY in environment or .env')
	const client = new OpenAI({ apiKey })

	const messages = messagesMap[String(mode).toLowerCase()] ?? messagesMap.role

	const completion = await client.chat.completions.create({
		model,
		temperature,
		max_tokens: maxTokens,
		messages,
	})

	console.log(completion.choices[0]?.message?.content ?? '')
}

// Direct-run support
if (process.argv[1] && process.argv[1].endsWith('chat_prompting.mjs')) {
	runChatDemo().catch((err) => {
		console.error('Error:', err?.message || String(err))
		process.exitCode = 1
	})
}
