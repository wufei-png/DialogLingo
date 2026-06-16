export function validateGenerationRequest(input: {
  sessionIds: string[]
  settings: {
    provider: {
      baseUrl: string
      apiKey: string
      defaultModel: string
    }
  }
}) {
  if (input.sessionIds.length === 0) {
    throw new Error('Select at least one session before generating.')
  }

  if (
    !input.settings.provider.baseUrl.trim() ||
    !input.settings.provider.apiKey.trim() ||
    !input.settings.provider.defaultModel.trim()
  ) {
    throw new Error('Configure LiteLLM base URL, API key, and default model first.')
  }
}
