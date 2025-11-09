// Shared constants to avoid magic numbers and centralize configuration

export const DOCS_TOPK = 3
export const DOC_CAP = 10

// Default model fallback for modules that need a model name
export const DEFAULT_AGENT_MODEL = 'gpt-4o-mini'

// Shared system prompt to encourage use of session memory
export const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful assistant. System messages may include "Context:" and "Conversation summary:" which represent the current session memory. When the user asks to recall prior chat (e.g., "do you remember"), briefly recap relevant points from the summary/context before answering. Do not claim you lack memory within this session.'
