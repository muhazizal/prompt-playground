# prompt-playground

LLM basics with runnable demos and a small CLI to explore:

- Tokens (tokenization)
- Embeddings (similarity scoring)
- Chat prompting (role, iterative refinement, embedding-style prompt)

## Setup

- Ensure Node.js is installed.
- Install dependencies: `npm install`
- Create `.env` with your OpenAI API key:

```
OPENAI_API_KEY=your_key_here
```

## CLI Usage

- Help: `node cli.mjs --help`
- Tokenization: `node cli.mjs tokens --text "Hello LLMs"` (no API key needed)
- Chat demo: `node cli.mjs chat --mode role` (requires `OPENAI_API_KEY`)
- Embeddings demo: `node cli.mjs embed --query "What is semantic search?"`

Options:

- Chat: `--mode role|iter|embed` `--model gpt-4o-mini` `--temp 0.3` `--max 100`
- Embeddings: `--model text-embedding-3-small` `--docs "doc1|doc2|doc3"`
- Tokens: `--tokenizer cl100k_base` `--text "..."`

## Interactive Mode

- Menu: `node cli.mjs interactive`
- Auto-prompt: run any command without options to be asked for inputs
  - Examples: `node cli.mjs tokens`, `node cli.mjs chat`, `node cli.mjs embed`, `node cli.mjs prompt`
  - You’ll be prompted for the relevant fields (text, mode, query, template, labels, etc.)

## NPM Scripts

- `npm run demo` → runs the CLI (same as `node cli.mjs`)
- `npm run demo:interactive` → launches the interactive menu
- `npm run demo:tokens` → `node examples/tokenization.mjs`
- `npm run demo:chat` → `node examples/chat_prompting.mjs`
- `npm run demo:embeddings` → `node examples/embeddings.mjs`
- `npm run demo:prompt` → `node examples/prompt_engineering.mjs`

## Prompt Templates

- See `notes/prompt-templates.md` for:
  - Few-shot classification (JSON)
  - Few-shot transformation (style/format)
  - Structured extraction (schema)
  - Stepwise reasoning (concise steps)
