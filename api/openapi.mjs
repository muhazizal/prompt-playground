export function registerOpenApiRoute(app) {
  const spec = {
    openapi: '3.0.0',
    info: { title: 'Prompt Playground API', version: '1.0.0' },
    paths: {
      '/prompt/models': { get: { responses: { 200: { description: 'OK' } } } },
      '/prompt/chat': {
        post: {
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ChatRequest' } },
            },
          },
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/ChatResponse' } },
              },
            },
          },
        },
      },
      '/prompt/chat/stream': { get: { responses: { 200: { description: 'OK' } } } },
      '/prompt/vision': { post: { responses: { 200: { description: 'OK' } } } },
      '/prompt/image-generation': { post: { responses: { 200: { description: 'OK' } } } },
      '/prompt/speech-to-text': { post: { responses: { 200: { description: 'OK' } } } },
      '/prompt/text-to-speech': { post: { responses: { 200: { description: 'OK' } } } },
      '/agent/run': {
        post: {
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AgentRunRequest' } },
            },
          },
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/AgentRunResult' } },
              },
            },
          },
        },
      },
      '/metrics': { get: { responses: { 200: { description: 'OK' } } } },
      '/health': { get: { responses: { 200: { description: 'OK' } } } },
    },
    components: {
      securitySchemes: {
        apiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      schemas: {
        ChatRequest: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            model: { type: 'string' },
            maxTokens: { type: 'integer' },
            n: { type: 'integer' },
            temperatures: { type: 'array', items: { type: 'number' } },
          },
          required: ['prompt'],
        },
        RunResult: {
          type: 'object',
          properties: {
            temperature: { type: 'number' },
            choices: {
              type: 'array',
              items: {
                type: 'object',
                properties: { index: { type: 'integer' }, text: { type: 'string' } },
              },
            },
            usage: { type: 'object' },
            durationMs: { type: 'integer' },
          },
        },
        ChatResponse: {
          type: 'object',
          properties: {
            runs: { type: 'array', items: { $ref: '#/components/schemas/RunResult' } },
            model: { type: 'string' },
            maxTokens: { type: 'integer' },
          },
        },
        AgentRunRequest: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            sessionId: { type: 'string' },
            useMemory: { type: 'boolean' },
            model: { type: 'string' },
            temperature: { type: 'number' },
            maxTokens: { type: 'integer' },
            chain: { type: 'string' },
          },
          required: ['prompt'],
        },
        AgentRunResult: {
          type: 'object',
          properties: {
            intent: { type: 'string' },
            answer: { type: 'string' },
            sources: { type: 'array' },
            usage: { type: 'object' },
            costUsd: { type: 'number' },
            durationMs: { type: 'integer' },
            steps: { type: 'array' },
          },
        },
      },
    },
  }
  app.get('/openapi', (_req, res) => {
    res.json(spec)
  })
}
