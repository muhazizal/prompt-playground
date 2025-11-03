## Notes — LLM Basics

- Tokens:
  - Tokens are chunks of text the model actually reads (often pieces of words, punctuation, spaces). Fewer tokens ⇒ cheaper/faster.
  - Tokenization converts text → integer IDs. Most chat models use the CL100K tokenizer.
  - Practical tip: Be token-efficient in prompts; prefer compact instructions, avoid redundant examples.

- Embeddings:
  - Embeddings are numeric vectors representing meaning. Similar texts have vectors close by (high cosine similarity).
  - Common uses: semantic search, clustering, deduplication, classification, recommendation, RAG indexing.
  - Typical dimensions: e.g., text-embedding-3-small (1536), text-embedding-3-large (3072). Choose smaller for speed/cost, larger for accuracy.

- Prompts:
  - Structure: System context (role/behavior), User input (task), Assistant (examples/format). Keep goals, constraints, and format explicit.
  - Recipes:
    - Role + checklist: "You are a critical reviewer. Evaluate X against criteria A/B/C; respond with a JSON object."
    - Iterative refinement: "Given the draft, produce improvements; ask one clarifying question if needed."
  - Controls: temperature (creativity), top_p (sampling diversity), max_tokens (output length), stop sequences (end early).



## How LLMs Process Text

1. Tokenize input → integer IDs
2. Embed tokens → vectors
3. Transformer layers apply attention to weigh context and patterns
4. Next-token prediction repeatedly generates output tokens
5. Decoding and sampling turn probabilities into text (greedy, temperature/top_p)
6. Detokenize IDs → final string
