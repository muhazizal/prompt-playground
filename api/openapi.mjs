export function registerOpenApiRoute(app) {
  const spec = {
    openapi: '3.0.0',
    info: { title: 'Prompt Playground API', version: '1.0.0' },
    security: [{ apiKeyHeader: [] }],
    paths: {
      '/prompt/models': {
        get: {
          summary: 'List available models',
          responses: {
            200: {
              description: 'Model list returned',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ModelsResponse' },
                  examples: {
                    default: {
                      summary: 'Example response',
                      value: {
                        models: [
                          { label: 'Text Generation', value: 'gpt-4o-mini' },
                          { label: 'Image Generation', value: 'gpt-image-1' },
                          { label: 'Image Vision', value: 'gpt-4o-mini' },
                          { label: 'Speech → Text', value: 'whisper-1' },
                          { label: 'Text → Speech', value: 'gpt-4o-mini-tts' },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/prompt/chat': {
        post: {
          summary: 'Chat with a model',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatRequest' },
                examples: {
                  example: {
                    summary: 'Chat request example',
                    value: {
                      prompt: 'what day is it rn?',
                      model: 'gpt-4o-mini',
                      maxTokens: 200,
                      n: 2,
                      temperatures: [0.5],
                      useMemory: true,
                      sessionId: 'H7sniPhIgmRiIydSkZjAV2QQplB2:chat',
                      reset: false,
                      memorySize: 30,
                      summaryMaxTokens: 200,
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Chat completed',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ChatResponse' },
                  examples: {
                    success: {
                      summary: 'Example chat response',
                      value: {
                        prompt: 'what day is it rn?',
                        model: 'gpt-4o-mini',
                        maxTokens: 200,
                        runs: [
                          {
                            temperature: 0.5,
                            choices: [
                              { index: 0, text: "Today's date is October 5, 2023." },
                              { index: 1, text: 'It is currently October 5, 2023.' },
                            ],
                            usage: {
                              prompt_tokens: 1620,
                              completion_tokens: 49,
                              total_tokens: 1669,
                              prompt_tokens_details: { cached_tokens: 0, audio_tokens: 0 },
                              completion_tokens_details: {
                                reasoning_tokens: 0,
                                audio_tokens: 0,
                                accepted_prediction_tokens: 0,
                                rejected_prediction_tokens: 0,
                              },
                            },
                            durationMs: 2438,
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/prompt/chat/stream': {
        get: {
          summary: 'Chat streaming (SSE)',
          parameters: [
            { in: 'query', name: 'prompt', required: true, schema: { type: 'string' } },
            { in: 'query', name: 'model', schema: { type: 'string', default: 'gpt-4o-mini' } },
            { in: 'query', name: 'temperature', schema: { type: 'number', default: 0.5 } },
            { in: 'query', name: 'maxTokens', schema: { type: 'integer', default: 1024 } },
            { in: 'query', name: 'useMemory', schema: { type: 'boolean', default: true } },
            { in: 'query', name: 'sessionId', schema: { type: 'string' } },
            { in: 'query', name: 'memorySize', schema: { type: 'integer', default: 200 } },
            { in: 'query', name: 'summaryMaxTokens', schema: { type: 'integer', default: 400 } },
          ],
          responses: {
            200: {
              description: 'Server-Sent Events stream',
              content: {
                'text/event-stream': {
                  schema: { type: 'string' },
                  examples: {
                    summary: { value: 'type summary: {"chunk":"!"}\n' },
                    result: {
                      value:
                        'type result: {"text":"Here’s a healthy recipe for **Strawberry Bread** that incorporates nutritious ingredients:\n\n### Healthy Strawberry Bread\n\n**Ingredients:**\n- 2 cups whole wheat flour\n- 1 teaspoon baking powder\n- 1/2 teaspoon baking soda\n- 1/2 teaspoon salt\n- 1 teaspoon cinnamon (optional)\n- 1/4 cup honey or maple syrup (adjust to taste)\n- 1/2 cup unsweetened applesauce\n- 1/4 cup Greek yogurt (for added protein)\n- 1 teaspoon vanilla extract\n- 1 cup fresh strawberries, hulled and chopped\n- Optional: 1/4 cup chopped nuts (like walnuts or almonds) for added crunch\n\n**Instructions:**\n\n1. **Preheat the Oven**: Preheat your oven to 350°F (175°C). Grease a loaf pan or line it with parchment paper.\n\n2. **Mix Dry Ingredients**: In a large bowl, whisk together the whole wheat flour, baking powder, baking soda, salt, and cinnamon.\n\n3. **Mix Wet Ingredients**: In another bowl, combine the honey (or maple syrup), applesauce, Greek yogurt, and vanilla extract. Mix until well combined.\n\n4. **Combine Mixtures**: Pour the wet ingredients into the dry ingredients and stir until just combined. Gently fold in the chopped strawberries and nuts, if using.\n\n5. **Bake**: Pour the batter into the prepared loaf pan and smooth the top. Bake for about 50-60 minutes, or until a toothpick inserted into the center comes out clean.\n\n6. **Cool and Serve**: Allow the bread to cool in the pan for about 10 minutes, then transfer it to a wire rack to cool completely. Slice and enjoy!\n\nThis healthy strawberry bread is a great way to enjoy the flavors of strawberries while incorporating whole grains and reducing added sugars. Enjoy!","model":"gpt-4o-mini"}\n',
                    },
                    usage: {
                      value:
                        'type usage: {"prompt_tokens":1561,"completion_tokens":386,"total_tokens":1947,"prompt_tokens_details":{"cached_tokens":0,"audio_tokens":0},"completion_tokens_details":{"reasoning_tokens":0,"audio_tokens":0,"accepted_prediction_tokens":0,"rejected_prediction_tokens":0}}\n',
                    },
                    end: { value: 'type end: {}\n' },
                  },
                },
              },
            },
          },
        },
      },
      '/prompt/vision': {
        post: {
          summary: 'Describe an image',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VisionRequest' },
                examples: {
                  url: {
                    summary: 'Via image URL',
                    value: {
                      imageUrl:
                        'https://www.promptingguide.ai/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fagent-components.6066d990.png&w=1920&q=75',
                      prompt: 'explain this image',
                      model: 'gpt-4o-mini',
                      maxTokens: 1024,
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Vision result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/VisionResponse' },
                  examples: {
                    success: {
                      value: {
                        text: "The image illustrates a conceptual framework for an \"agent\" that processes user requests or tasks. Here's a breakdown of its components:\n\n1. **Task / User Request**: This is the input that the agent receives, indicating what action or information the user is seeking.\n\n2. **Agent**: The central processing unit that interprets the user request and coordinates the necessary actions.\n\n3. **Tools**: This component represents the resources or functionalities available to the agent to perform tasks. It could include software tools, APIs, or other utilities.\n\n4. **Memory**: This refers to the agent's ability to store and retrieve information. It allows the agent to remember past interactions or data that can inform future responses.\n\n5. **Planning**: This aspect involves the agent's capability to strategize or organize actions based on the user request and available tools. It helps in determining the best course of action to fulfill the request.\n\nOverall, the diagram emphasizes the interaction between the user, the agent, and the various components that enable the agent to effectively respond to requests.",
                        usage: {
                          prompt_tokens: 25523,
                          completion_tokens: 213,
                          total_tokens: 25736,
                          prompt_tokens_details: { cached_tokens: 0, audio_tokens: 0 },
                          completion_tokens_details: {
                            reasoning_tokens: 0,
                            audio_tokens: 0,
                            accepted_prediction_tokens: 0,
                            rejected_prediction_tokens: 0,
                          },
                        },
                        model: 'gpt-4o-mini',
                        durationMs: 5632,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/prompt/image-generation': {
        post: {
          summary: 'Generate an image from text',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ImageGenRequest' },
                examples: {
                  prompt: {
                    value: {
                      prompt: 'generate image of "AI Agent" in 5 years future',
                      model: 'gpt-image-1',
                      size: '1024x1024',
                      format: 'png',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Image generated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ImageGenResponse' },
                  examples: {
                    success: {
                      value: {
                        contentType: 'image/png',
                        durationMs: 23894,
                        imageBase64: 'example-base-64',
                        model: 'gpt-image-1',
                        size: '1024x1024',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/prompt/speech-to-text': {
        post: {
          summary: 'Transcribe audio base64 to text',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/STTRequest' },
                examples: {
                  basic: { value: { audioBase64: 'example-audio-base-64', model: 'whisper-1' } },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Transcription result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/STTResponse' },
                  examples: {
                    success: {
                      value: {
                        text: 'Yesterday it was 35°C in Barcelona, but today the temperature will go down to minus 20°C.',
                        model: 'whisper-1',
                        durationMs: 3012,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/prompt/text-to-speech': {
        post: {
          summary: 'Synthesize speech from text',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TTSRequest' },
                examples: {
                  basic: {
                    value: {
                      format: 'mp3',
                      model: 'gpt-4o-mini-tts',
                      text: "Structured Outputs is a feature that ensures the model will always generate responses that adhere to your supplied JSON Schema, so you don't need to worry about the model omitting a required key, or hallucinating an invalid enum value.",
                      voice: 'onyx',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Audio generated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TTSResponse' },
                  examples: {
                    success: {
                      value: {
                        audioBase64: 'audio-base-64',
                        contentType: 'audio/mpeg',
                        durationMs: 2155,
                        model: 'gpt-4o-mini-tts',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/agent/run': {
        post: {
          summary: 'Run mini agent with optional tools and memory',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AgentRunRequest' },
                examples: {
                  basic: {
                    value: {
                      prompt: 'weather today in Yogyakarta',
                      sessionId:
                        'H7sniPhIgmRiIydSkZjAV2QQplB2:1866dc43-2537-4351-b110-4817603f9912',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Agent result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AgentRunResult' },
                  examples: {
                    success: {
                      value: {
                        intent: 'answer',
                        answer:
                          'The weather in Yogyakarta today is light drizzle with a temperature of 28.5°C, feeling like 31.9°C, humidity at 70%.',
                        sources: [
                          {
                            type: 'weather',
                            title: 'Yogyakarta',
                            url: ' `http://api.weatherapi.com/v1/current.json?key=3c6609d865e846bdb4803716250611&q=Yogyakarta` ',
                            snippet:
                              'Weather for Yogyakarta: Light drizzle, temp 28.5°C, feels 31.9°C, humidity 70%, wind 15.5 kph.',
                            meta: { temp_c: 28.5, condition: 'Light drizzle' },
                          },
                          {
                            type: 'doc',
                            file: ' `http://api.weatherapi.com/v1/current.json?key=3c6609d865e846bdb4803716250611&q=Yogyakarta` ',
                          },
                        ],
                        model: 'gpt-4o-mini',
                        temperature: 0.5,
                        maxTokens: 10000,
                        usage: { promptTokens: 930, completionTokens: 76, totalTokens: 1006 },
                        durationMs: 1872,
                        costUsd: 0.000185,
                        steps: [
                          'init',
                          'intent:in-llm',
                          'tool:weather:Yogyakarta',
                          'tools:done',
                          'memory:msgs=12',
                          'llm:end:1872ms',
                        ],
                        debug: {
                          messages: [
                            {
                              role: 'system',
                              content:
                                'You are a concise AI agent. Return STRICT JSON only.\nSchema: {"intent": string, "answer": string, "sources": string[]}\n- intent: one of ["chat", "answer", "tool-summary"]\n- answer: final short answer for user\n- sources: filenames or urls you relied on\nRules:\n- Prioritize answering the user\'s prompt directly.\n- Use tool outputs only if relevant to the prompt.\n- If no tools are used, return sources: [].\nNo markdown, no prose outside JSON.',
                            },
                            {
                              role: 'system',
                              content:
                                'Context: {"memorySummary":"","tools":{"weather":{"ok":true,"summary":"Weather for Yogyakarta: Light drizzle, temp 28.5°C, feels 31.9°C, humidity 70%, wind 15.5 kph.","source":" `http://api.weatherapi.com/v1/current.json?key=3c6609d865e846bdb4803716250611&q=Yogyakarta` ","data":{"location":{"name":"Yogyakarta","region":"Daerah Istimewa Yogyakarta","country":"Indonesia","lat":-7.7828,"lon":110.3608,"tz_id":"Asia/Jakarta","localtime_epoch":1763012013,"localtime":"2025-11-13 12:33"},"current":{"last_updated_epoch":1763011800,"last_updated":"2025-11-13 12:30","temp_c":28.5,"temp_f":83.3,"is_day":1,"condition":{"text":"Light drizzle","icon":"//cdn.weatherapi.com/weather/64x64/day/266.png","code":1153},"wind_mph":9.6,"wind_kph":15.5,"wind_degree":243,"wind_dir":"WSW","pressure_mb":1010,"pressure_in":29.84,"precip_mm":0.74,"precip_in":0.03,"humidity":70,"cloud":76,"feelslike_c":31.9,"feelslike_f":89.3,"windchill_c":28.5,"windchill_f":83.3,"heatindex_c":31.9,"heatindex_f":89.3,"dewpoint_c":22.5,"dewpoint_f":72.6,"vis_km":2,"vis_miles":1,"uv":11.4,"gust_mph":11.1,"gust_kph":17.8,"short_rad":694.36,"diff_rad":225.44,"dni":0,"gti":225.04}}}}}',
                            },
                            { role: 'user', content: 'hello ai agent' },
                            {
                              role: 'assistant',
                              content:
                                '{"intent":"chat","answer":"Hello! How can I assist you today?","sources":[]}',
                            },
                            { role: 'user', content: 'weather today in yogyakarta' },
                            {
                              role: 'assistant',
                              content:
                                '{"intent":"answer","answer":"The weather in Yogyakarta today is light drizzle with a temperature of 24°C, feeling like 26.6°C. Humidity is at 94%.","sources":[" `http://api.weatherapi.com/v1/current.json?key=3c6609d865e846bdb4803716250611&q=Yogyakarta` "]}',
                            },
                            { role: 'user', content: 'why the answer in object not string?' },
                            {
                              role: 'assistant',
                              content:
                                '{"intent":"answer","answer":"The response is structured in JSON format to provide clear and organized information, making it easier for systems to parse and understand.","sources":[]}',
                            },
                            { role: 'user', content: "What's the weather in Yogyakarta?" },
                            {
                              role: 'assistant',
                              content:
                                '{"intent":"answer","answer":"The weather in Yogyakarta is cloudy with a temperature of 25.1°C, feels like 27.4°C, humidity at 83%.","sources":[" `http://api.weatherapi.com/v1/current.json?key=3c6609d865e846bdb4803716250611&q=Yogyakarta` "]}',
                            },
                            { role: 'user', content: 'recommended outfit for that weather' },
                            {
                              role: 'assistant',
                              content:
                                '{"intent":"answer","answer":"For the cloudy and humid weather in Yogyakarta, lightweight and breathable clothing such as a short-sleeve shirt and shorts or a light dress are recommended. Don\'t forget an umbrella or a light jacket for possible drizzle.","sources":[]}',
                            },
                            { role: 'user', content: 'recommended foods for that weather' },
                            {
                              role: 'assistant',
                              content:
                                '{"intent":"answer","answer":"In humid and cloudy weather, light and refreshing foods like salads, fruit, or cold noodle dishes are recommended. You might also enjoy warm soups or spicy dishes to balance the humidity.","sources":[]}',
                            },
                            { role: 'user', content: 'weather today in Yogyakarta' },
                          ],
                          toolsContext: {
                            weather: {
                              ok: true,
                              summary:
                                'Weather for Yogyakarta: Light drizzle, temp 28.5°C, feels 31.9°C, humidity 70%, wind 15.5 kph.',
                              source:
                                ' `http://api.weatherapi.com/v1/current.json?key=3c6609d865e846bdb4803716250611&q=Yogyakarta` ',
                              data: {
                                location: {
                                  name: 'Yogyakarta',
                                  region: 'Daerah Istimewa Yogyakarta',
                                  country: 'Indonesia',
                                  lat: -7.7828,
                                  lon: 110.3608,
                                  tz_id: 'Asia/Jakarta',
                                  localtime_epoch: 1763012013,
                                  localtime: '2025-11-13 12:33',
                                },
                                current: {
                                  last_updated_epoch: 1763011800,
                                  last_updated: '2025-11-13 12:30',
                                  temp_c: 28.5,
                                  temp_f: 83.3,
                                  is_day: 1,
                                  condition: {
                                    text: 'Light drizzle',
                                    icon: '//cdn.weatherapi.com/weather/64x64/day/266.png',
                                    code: 1153,
                                  },
                                  wind_mph: 9.6,
                                  wind_kph: 15.5,
                                  wind_degree: 243,
                                  wind_dir: 'WSW',
                                  pressure_mb: 1010,
                                  pressure_in: 29.84,
                                  precip_mm: 0.74,
                                  precip_in: 0.03,
                                  humidity: 70,
                                  cloud: 76,
                                  feelslike_c: 31.9,
                                  feelslike_f: 89.3,
                                  windchill_c: 28.5,
                                  windchill_f: 83.3,
                                  heatindex_c: 31.9,
                                  heatindex_f: 89.3,
                                  dewpoint_c: 22.5,
                                  dewpoint_f: 72.6,
                                  vis_km: 2,
                                  vis_miles: 1,
                                  uv: 11.4,
                                  gust_mph: 11.1,
                                  gust_kph: 17.8,
                                  short_rad: 694.36,
                                  diff_rad: 225.44,
                                  dni: 0,
                                  gti: 225.04,
                                },
                              },
                            },
                          },
                          validationErrors: [],
                        },
                      },
                    },
                  },
                },
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
        ErrorResponse: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            error: { type: 'string' },
            details: { type: 'object' },
          },
        },
        ModelsResponse: {
          type: 'object',
          properties: {
            models: {
              type: 'array',
              items: {
                type: 'object',
                properties: { label: { type: 'string' }, value: { type: 'string' } },
              },
            },
          },
        },
        Usage: {
          type: 'object',
          properties: {
            prompt_tokens: { type: 'integer' },
            completion_tokens: { type: 'integer' },
            total_tokens: { type: 'integer' },
            promptTokens: { type: 'integer' },
            completionTokens: { type: 'integer' },
            totalTokens: { type: 'integer' },
            prompt_tokens_details: {
              type: 'object',
              properties: { cached_tokens: { type: 'integer' }, audio_tokens: { type: 'integer' } },
            },
            completion_tokens_details: {
              type: 'object',
              properties: {
                reasoning_tokens: { type: 'integer' },
                audio_tokens: { type: 'integer' },
                accepted_prediction_tokens: { type: 'integer' },
                rejected_prediction_tokens: { type: 'integer' },
              },
            },
          },
        },
        VisionRequest: {
          type: 'object',
          properties: {
            imageUrl: { type: 'string' },
            imageBase64: { type: 'string' },
            prompt: { type: 'string' },
            model: { type: 'string' },
            maxTokens: { type: 'integer' },
          },
        },
        ChatRequest: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            model: { type: 'string' },
            maxTokens: { type: 'integer' },
            n: { type: 'integer' },
            temperatures: { type: 'array', items: { type: 'number' } },
            useMemory: { type: 'boolean' },
            sessionId: { type: 'string' },
            reset: { type: 'boolean' },
            memorySize: { type: 'integer' },
            summaryMaxTokens: { type: 'integer' },
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
            usage: { $ref: '#/components/schemas/Usage' },
            durationMs: { type: 'integer' },
          },
        },
        ChatResponse: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            runs: { type: 'array', items: { $ref: '#/components/schemas/RunResult' } },
            model: { type: 'string' },
            maxTokens: { type: 'integer' },
          },
        },
        VisionResponse: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            usage: { $ref: '#/components/schemas/Usage' },
            durationMs: { type: 'integer' },
            model: { type: 'string' },
          },
        },
        ImageGenRequest: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            model: { type: 'string' },
            size: { type: 'string' },
            format: { type: 'string' },
          },
          required: ['prompt'],
        },
        ImageGenResponse: {
          type: 'object',
          properties: {
            imageBase64: { type: 'string' },
            contentType: { type: 'string' },
            model: { type: 'string' },
            durationMs: { type: 'integer' },
            size: { type: 'string' },
          },
        },
        STTRequest: {
          type: 'object',
          properties: {
            audioBase64: { type: 'string' },
            model: { type: 'string' },
          },
          required: ['audioBase64'],
        },
        STTResponse: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            durationMs: { type: 'integer' },
            model: { type: 'string' },
          },
        },
        TTSRequest: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            model: { type: 'string' },
            voice: { type: 'string' },
            format: { type: 'string' },
          },
          required: ['text'],
        },
        TTSResponse: {
          type: 'object',
          properties: {
            audioBase64: { type: 'string' },
            contentType: { type: 'string' },
            durationMs: { type: 'integer' },
            model: { type: 'string' },
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
            sources: { type: 'array', items: { $ref: '#/components/schemas/AgentSource' } },
            model: { type: 'string' },
            temperature: { type: 'number' },
            maxTokens: { type: 'integer' },
            usage: { $ref: '#/components/schemas/Usage' },
            durationMs: { type: 'integer' },
            costUsd: { type: 'number' },
            steps: { type: 'array', items: { type: 'string' } },
            debug: { $ref: '#/components/schemas/AgentDebug' },
          },
        },
        AgentSource: {
          oneOf: [
            { $ref: '#/components/schemas/AgentSourceWeather' },
            { $ref: '#/components/schemas/AgentSourceDoc' },
          ],
        },
        AgentSourceWeather: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['weather'] },
            title: { type: 'string' },
            url: { type: 'string' },
            snippet: { type: 'string' },
            meta: {
              type: 'object',
              properties: { temp_c: { type: 'number' }, condition: { type: 'string' } },
            },
          },
          required: ['type'],
        },
        AgentSourceDoc: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['doc'] },
            file: { type: 'string' },
          },
          required: ['type'],
        },
        AgentDebug: {
          type: 'object',
          properties: {
            messages: {
              type: 'array',
              items: { $ref: '#/components/schemas/AgentMessage' },
            },
            toolsContext: { type: 'object' },
            validationErrors: { type: 'array' },
          },
        },
        AgentMessage: {
          type: 'object',
          properties: { role: { type: 'string' }, content: { type: 'string' } },
        },
      },
    },
  }
  app.get('/openapi', (_req, res) => {
    res.json(spec)
  })
}
