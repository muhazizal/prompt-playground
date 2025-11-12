import type { RunResult } from '@/helpers/types'

export type ChatResponse = { runs: RunResult[]; model?: string; maxTokens?: number }
export type VisionResponse = { text: string; usage?: any; durationMs?: number; model?: string }
export type STTResponse = { text: string; durationMs?: number; model?: string }
export type TTSResponse = {
  audioBase64?: string
  contentType?: string
  durationMs?: number
  model?: string
}
export type ImageGenResponse = { imageBase64?: string; model?: string }
