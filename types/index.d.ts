export type SpeedReading = {
  /** Milliseconds from the request going out to its first streamed token. */
  ttftMs: number | null
  /** Milliseconds from the first streamed token to the last. */
  genMs: number
  /** Characters the model emitted (text, thinking and tool-call arguments). */
  chars: number
  /** Output tokens the API reported, null until the response stops. */
  tokens: number | null
  charsPerSec: number | null
  tokensPerSec: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'output-speed': {
      live: SpeedReading | null
      last: SpeedReading | null
      isHidden: boolean
    }
  }
}
