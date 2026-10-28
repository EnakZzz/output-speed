import { expect, mock, test } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'

import type { SpeedReading } from '../types'

const USAGE = {
  input_tokens: 10,
  output_tokens: 12,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  model: 'test-model',
}

const STEP = { turnId: 't1', index: 0, model: 'test-model', messageCount: 1 }

const RUN = {
  command: 'speed',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

const BAND = {
  plugin: 'output-speed',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 3,
    bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 2 },
    view: {},
  },
} as const

// TTFT 40ms, then 11 characters and 12 tokens over a 510ms generation window.
async function measureOnce(
  $: Engine,
  on: Parameters<TestBody>[1],
): Promise<{ last: () => SpeedReading | null }> {
  const clock = mock.clock(on)
  let written: SpeedReading | null = null

  on('state.set', { plugin: 'output-speed', key: 'last' }, ($, e, next) => {
    written = e.value as SpeedReading

    return next(e)
  })

  on('turn.step', async function* () {
    await clock.sleep(40)
    yield { kind: 'text', index: 0, text: 'hello' }
    await clock.sleep(500)
    yield { kind: 'text', index: 0, text: ' world' }
    await clock.sleep(10)
    yield { kind: 'stop', stopReason: 'end_turn', usage: USAGE }

    return {
      turnId: 't1',
      index: 0,
      answer: 'hello world',
      toolUses: [],
      stopReason: 'end_turn',
      usage: USAGE,
    }
  })

  const stream = $.turn.step(STEP)
  const drained = (async () => {
    for await (const chunk of stream) void chunk
  })()

  await clock.advance(40)
  await clock.advance(500)
  await clock.advance(10)
  await drained

  return { last: () => written }
}

test('reports ttft and tok/s over the generation window', async ($, on) => {
  const { last } = await measureOnce($, on)
  const reading = last()

  expect(reading?.ttftMs).toBe(40)
  expect(reading?.genMs).toBe(510)
  expect(reading?.chars).toBe(11)
  expect(reading?.tokens).toBe(12)
  expect(reading?.tokensPerSec).toBeGreaterThan(22)
  expect(reading?.tokensPerSec).toBeLessThan(25)
  expect(reading?.charsPerSec).toBeGreaterThan(20)
  expect(reading?.charsPerSec).toBeLessThan(23)
})

test('draws the last measurement above the prompt', async ($, on) => {
  await measureOnce($, on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const row = await ui.find({ type: 'Text', text: /tok\/s/ })

    expect(row?.text).toContain('23.5 tok/s')
    expect(row?.text).toContain('首字 0.04s')
    expect(row?.text).toContain('12 tok')
    await ui.unmount()
  }
})

test('/speed hides and shows the band', async ($, on) => {
  // What draws when the plugin leaves the band alone, as the engine would.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await measureOnce($, on)

  expect((await $.command.run(RUN)).text).toContain('已隐藏')

  const hidden = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await hidden.find({ type: 'Text', text: /tok\/s/ })).toBeUndefined()
  await hidden.unmount()

  expect((await $.command.run(RUN)).text).toContain('已显示')

  const shown = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await shown.find({ type: 'Text', text: /tok\/s/ }))?.text).toContain('23.5 tok/s')
  await shown.unmount()
})
