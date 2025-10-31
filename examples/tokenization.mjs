import { get_encoding } from '@dqbd/tiktoken'

export function runTokenization({
	tokenizer = 'cl100k_base',
	text = 'Large language models convert text into tokens and reason over them.',
} = {}) {
	const enc = get_encoding(tokenizer)
	const tokens = enc.encode(text)
	console.log('Text:', text)
	console.log('Token count:', tokens.length)
	console.log('First 50 token IDs:', tokens.slice(0, 50))
	enc.free()
}

// Direct-run support
if (process.argv[1] && process.argv[1].endsWith('tokenization.mjs')) {
	runTokenization()
}
