export function registerOpenApiRoute(app) {
  const spec = {
    openapi: '3.0.0',
    info: { title: 'Prompt Playground API', version: '1.0.0' },
    paths: {
      '/prompt/models': { get: { responses: { 200: { description: 'OK' } } } },
      '/prompt/chat': { post: { responses: { 200: { description: 'OK' } } } },
      '/prompt/chat/stream': { get: { responses: { 200: { description: 'OK' } } } },
      '/prompt/vision': { post: { responses: { 200: { description: 'OK' } } } },
      '/prompt/image-generation': { post: { responses: { 200: { description: 'OK' } } } },
      '/prompt/speech-to-text': { post: { responses: { 200: { description: 'OK' } } } },
      '/prompt/text-to-speech': { post: { responses: { 200: { description: 'OK' } } } },
      '/agent/run': { post: { responses: { 200: { description: 'OK' } } } },
      '/metrics': { get: { responses: { 200: { description: 'OK' } } } },
      '/health': { get: { responses: { 200: { description: 'OK' } } } },
    },
  }
  app.get('/openapi', (_req, res) => {
    res.json(spec)
  })
}
