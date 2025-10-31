#!/usr/bin/env node
import dotenv from 'dotenv'
dotenv.config()

import { runTokenization } from './examples/tokenization.mjs'
import { runEmbeddingsDemo } from './examples/embeddings.mjs'
import { runChatDemo } from './examples/chat_prompting.mjs'
import { runPromptEngineeringDemo } from './examples/prompt_engineering.mjs'
import readline from 'node:readline'
import { stdin as input, stdout as output } from 'node:process'

async function main() {
	const [cmd, ...rest] = process.argv.slice(2)
	const flags = parseFlags(rest)

	if (!cmd || cmd === 'help' || cmd === '--help' || flags.help) {
		printHelp()
		return
	}

	try {
		switch (cmd) {
			case 'tokens':
				if (!hasFlags(flags)) {
					await interactiveTokens()
				} else {
					await runTokens(flags)
				}
				break
			case 'chat':
				if (!hasFlags(flags)) {
					await interactiveChat()
				} else {
					await runChat(flags)
				}
				break
			case 'embed':
			case 'embeddings':
				if (!hasFlags(flags)) {
					await interactiveEmbeddings()
				} else {
					await runEmbeddings(flags)
				}
				break
			case 'prompt':
				if (!hasFlags(flags)) {
					await interactivePrompt()
				} else {
					await runPrompt(flags)
				}
				break
			case 'interactive':
				await interactiveMenu()
				break
			default:
				console.error(`Unknown command: ${cmd}`)
				printHelp()
				process.exitCode = 1
		}
	} catch (err) {
		handleError(err)
	}
}

function parseFlags(argv) {
	const args = {}
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i]
		if (token.startsWith('--')) {
			const key = token.slice(2)
			const next = argv[i + 1]
			if (!next || next.startsWith('--')) {
				args[key] = true
			} else {
				args[key] = next
				i++
			}
		} else {
			if (!args._) args._ = []
			args._.push(token)
		}
	}
	return args
}

function handleError(err) {
	const msg = err?.message || String(err)
	console.error('Error:', msg)
	process.exitCode = 1
}

function hasFlags(flags) {
	return Object.keys(flags).some((k) => k !== '_')
}

function createRL() {
	return readline.createInterface({ input, output })
}

function ask(rl, q, def) {
	return new Promise((resolve) => {
		const prompt = def != null ? `${q} (${def}): ` : `${q}: `
		rl.question(prompt, (ans) => resolve(ans || def || ''))
	})
}

async function runChat(flags) {
	const model = flags.model ?? 'gpt-4o-mini'
	const temperature = flags.temp ? Number(flags.temp) : 0.3
	const maxTokens = flags.max ? Number(flags.max) : 100
	const mode = String(flags.mode ?? 'role').toLowerCase()
	await runChatDemo({ model, temperature, maxTokens, mode })
}

async function runEmbeddings(flags) {
	const model = flags.model ?? 'text-embedding-3-small'
	const query = flags.query ?? 'What is semantic search?'
	const docsRaw =
		flags.docs ?? 'How to boil pasta|Understanding neural networks|A guide to semantic search'
	const docs = docsRaw
		.split('|')
		.map((s) => s.trim())
		.filter(Boolean)
	await runEmbeddingsDemo({ model, query, docs })
}

async function runTokens(flags) {
	const tokenizer = flags.tokenizer ?? 'cl100k_base'
	const text = flags.text ?? 'Large language models convert text into tokens and reason over them.'
	await runTokenization({ tokenizer, text })
}

async function runPrompt(flags) {
	const template = String(flags.template ?? 'classify').toLowerCase()
	const inputText = flags.input
	const labels = flags.labels
		? String(flags.labels)
				.split('|')
				.map((s) => s.trim())
				.filter(Boolean)
		: undefined
	const model = flags.model ?? 'gpt-4o-mini'
	const temperature = flags.temp ? Number(flags.temp) : 0.3
	const maxTokens = flags.max ? Number(flags.max) : 200
	await runPromptEngineeringDemo({ template, inputText, labels, model, temperature, maxTokens })
}

async function interactiveMenu() {
	const rl = createRL()
	const pick = (await ask(rl, 'Choose demo (tokens/chat/embed/prompt)', 'tokens')).toLowerCase()
	rl.close()
	switch (pick) {
		case 'tokens':
			await interactiveTokens()
			return
		case 'chat':
			await interactiveChat()
			return
		case 'embed':
		case 'embeddings':
			await interactiveEmbeddings()
			return
		case 'prompt':
			await interactivePrompt()
			return
		default:
			console.error(`Unknown selection: ${pick}`)
			printHelp()
			process.exitCode = 1
	}
}

async function interactiveTokens() {
	const rl = createRL()
	const text = await ask(
		rl,
		'Text',
		'Large language models convert text into tokens and reason over them.'
	)
	const tokenizer = await ask(rl, 'Tokenizer', 'cl100k_base')
	rl.close()
	await runTokenization({ tokenizer, text })
}

async function interactiveChat() {
	const rl = createRL()
	const mode = (await ask(rl, 'Mode (role|iter|embed)', 'role')).toLowerCase()
	const model = await ask(rl, 'Model', 'gpt-4o-mini')
	const tempRaw = await ask(rl, 'Temperature', '0.3')
	const maxRaw = await ask(rl, 'Max tokens', '100')
	rl.close()
	const temperature = Number(tempRaw)
	const maxTokens = Number(maxRaw)
	await runChatDemo({ model, temperature, maxTokens, mode })
}

async function interactiveEmbeddings() {
	const rl = createRL()
	const query = await ask(rl, 'Query', 'What is semantic search?')
	const docsRaw = await ask(
		rl,
		'Docs (pipe-separated)',
		'How to boil pasta|Understanding neural networks|A guide to semantic search'
	)
	const model = await ask(rl, 'Model', 'text-embedding-3-small')
	rl.close()
	const docs = docsRaw
		.split('|')
		.map((s) => s.trim())
		.filter(Boolean)
	await runEmbeddingsDemo({ model, query, docs })
}

async function interactivePrompt() {
	const rl = createRL()
	const template = (
		await ask(rl, 'Template (classify|transform|extract|reason)', 'classify')
	).toLowerCase()
	const inputText = await ask(rl, 'Input text', '')
	const labelsRaw = await ask(rl, 'Labels (pipe-separated, optional)', '')
	const model = await ask(rl, 'Model', 'gpt-4o-mini')
	const tempRaw = await ask(rl, 'Temperature', '0.3')
	const maxRaw = await ask(rl, 'Max tokens', '200')
	rl.close()
	const labels = labelsRaw
		.split('|')
		.map((s) => s.trim())
		.filter(Boolean)
	const temperature = Number(tempRaw)
	const maxTokens = Number(maxRaw)
	const question = template === 'reason' ? inputText : undefined
	await runPromptEngineeringDemo({
		template,
		inputText,
		labels,
		question,
		model,
		temperature,
		maxTokens,
	})
}

function printHelp() {
	console.log(
		`Usage: node cli.mjs <command> [options]\n\nCommands:\n  tokens            Tokenize a string and show token IDs\n  chat              Run a chat completion demo\n  embed             Generate embeddings and rank sample docs\n  prompt            Prompt-engineering demo (few-shot, transform, extract, reason)\n  interactive       Interactive menu to run any demo\n\nOptions:\n  --help            Show this help\n\nInteractive:\n  node cli.mjs interactive\n  Or run a command without options to be prompted.\n\nTokens:\n  node cli.mjs tokens --text "Your text" [--tokenizer cl100k_base]\n\nChat:\n  node cli.mjs chat --mode role|iter|embed [--model gpt-4o-mini] [--temp 0.3] [--max 100]\n\nEmbeddings:\n  node cli.mjs embed [--query "text"] [--docs "doc1|doc2|doc3"] [--model text-embedding-3-small]\n\nPrompt-engineering:\n  node cli.mjs prompt --template classify|transform|extract|reason [--input "text"] [--labels "A|B|C"]\n\nEnvironment:\n  Set OPENAI_API_KEY in .env or environment for chat/embed.\n`
	)
}

main()
