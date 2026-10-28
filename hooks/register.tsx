import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { SpeedReading } from '../types'

const live = atom({ plugin: 'output-speed', key: 'live' } as const, null)
const last = atom({ plugin: 'output-speed', key: 'last' } as const, null)
const isHidden = atom({ plugin: 'output-speed', key: 'isHidden' } as const, false)

/** Content chunks between two clock reads while streaming: ~8 draws a second. */
const SAMPLE_EVERY = 8
/** Below this window a rate is mostly timing noise, so none is reported. */
const MIN_WINDOW_MS = 150

function makeReading(
  ttftMs: number | null,
  genMs: number,
  chars: number,
  tokens: number | null,
): SpeedReading {
  const isMeasurable = genMs >= MIN_WINDOW_MS
  const seconds = genMs / 1000

  return {
    ttftMs,
    genMs,
    chars,
    tokens,
    charsPerSec: isMeasurable ? chars / seconds : null,
    tokensPerSec: isMeasurable && tokens !== null ? tokens / seconds : null,
  }
}

function formatCount(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
}

function formatSeconds(ms: number): string {
  return ms >= 10_000 ? `${Math.round(ms / 1000)}s` : `${(ms / 1000).toFixed(2)}s`
}

function rateOf(reading: SpeedReading, key: 'charsPerSec' | 'tokensPerSec'): string | null {
  const rate = reading[key]

  return rate === null ? null : `${rate.toFixed(1)} ${key === 'tokensPerSec' ? 'tok/s' : '字/s'}`
}

/** The line while a request streams: no token count exists until it stops. */
function streamingLine(reading: SpeedReading): string {
  const parts = [rateOf(reading, 'charsPerSec') ?? '等首字', `${formatCount(reading.chars)} 字`]

  if (reading.genMs > 0) {
    parts.push(formatSeconds(reading.genMs))
  }

  return parts.join(' · ')
}

/** The line once a request has answered: tokens over the generation window. */
function finishedLine(reading: SpeedReading): string {
  const parts: string[] = []
  const rate = rateOf(reading, 'tokensPerSec') ?? rateOf(reading, 'charsPerSec')

  if (rate !== null) {
    parts.push(rate)
  }
  if (reading.ttftMs !== null) {
    parts.push(`首字 ${formatSeconds(reading.ttftMs)}`)
  }
  parts.push(reading.tokens === null ? `${formatCount(reading.chars)} 字` : `${reading.tokens} tok`)
  if (reading.genMs > 0) {
    parts.push(`生成 ${formatSeconds(reading.genMs)}`)
  }

  return parts.join(' · ')
}

export const register: Register = on => {
  on('turn.step', async function* ($, e, next) {
    const startedAt = await $.clock.now()
    let firstAt = -1
    let chars = 0
    let tokens: number | null = null
    let sinceSample = 0

    const snapshot = async (): Promise<SpeedReading> => {
      const at = await $.clock.now()
      const genMs = firstAt < 0 ? 0 : Math.max(at - firstAt, 0)
      const ttftMs = firstAt < 0 ? null : Math.max(firstAt - startedAt, 0)

      return makeReading(ttftMs, genMs, chars, tokens)
    }

    try {
      for await (const chunk of next(e)) {
        const isContent =
          chunk.kind === 'text' || chunk.kind === 'thinking' || chunk.kind === 'input'

        if (chunk.kind === 'text' || chunk.kind === 'thinking') {
          chars += chunk.text.length
        } else if (chunk.kind === 'input') {
          chars += chunk.json.length
        } else if (chunk.kind === 'stop') {
          tokens = chunk.usage?.output_tokens ?? null
        }

        if (isContent) {
          if (firstAt < 0) {
            firstAt = await $.clock.now()
          }

          sinceSample += 1
          if (sinceSample >= SAMPLE_EVERY) {
            sinceSample = 0
            const reading = await snapshot()
            await update($, live, () => reading)
          }
        }

        yield chunk
      }
    } finally {
      if (firstAt >= 0) {
        const reading = await snapshot()
        await update($, last, () => reading)
      }
      await update($, live, () => null)
    }
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'speed',
      description: '显示或隐藏模型的输出速度',
    })

    return next(e)
  })

  on('command.run', { command: 'speed' }, async $ => {
    const wasHidden = await read($, isHidden)
    await update($, isHidden, () => !wasHidden)
    const previous = await read($, last)
    const summary = previous === null ? '还没有测到输出。' : `上次：${finishedLine(previous)}`

    return { text: `${wasHidden ? '已显示' : '已隐藏'}输出速度。${summary}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const current = await read($, live)
    const previous = await read($, last)
    const isStreaming = e.props.isWorking && current !== null
    const shown = isStreaming ? current : previous

    if (shown === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>{isStreaming ? '输出 ' : '上次 '}</Text>
        <Text tabular>{isStreaming ? streamingLine(shown) : finishedLine(shown)}</Text>
      </Box>
    )
  })
}
