import dotenv from 'dotenv'
import { getClient, listNoteFiles, readNote, summarize, rankTags } from '../api/notes-core.mjs'

dotenv.config()

async function main() {
	const apiKey = process.env.OPENAI_API_KEY
	if (!apiKey) {
		console.error('Missing OPENAI_API_KEY in environment')
		process.exit(1)
	}
	const client = getClient(apiKey)

	const files = listNoteFiles()
	if (files.length === 0) {
		console.log('No notes found in ./notes (md/txt).')
		return
	}
	console.log(`Found ${files.length} notes. Processing...`)

	const results = []
	for (const f of files) {
		const text = readNote(f.path)
		const { summary, tags: llmTags, usage } = await summarize(client, text, {})
		const embedTags = await rankTags(client, text)
		const tags = Array.from(new Set([...(llmTags || []), ...(embedTags || [])])).slice(0, 7)

		results.push({ file: f.name, summary, tags, usage })

		console.log(`\n=== ${f.name} ===`)
		console.log(summary)
		console.log('Tags:', tags.join(', '))

		if (usage) {
			const u = usage

			console.log(
				`Tokens: prompt ${u?.prompt_tokens ?? 0}, completion ${u?.completion_tokens ?? 0}, total ${
					u?.total_tokens ?? 0
				}`
			)
		}
	}
}

main().catch((e) => {
	console.error('Error:', e?.message || e)
	process.exit(1)
})
