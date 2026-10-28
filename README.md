# output-speed

A Claude Code mod that shows how fast the model is actually writing, in a line
right above the prompt box.

While a response streams it shows characters per second; once the response
stops it shows tokens per second, time to first token, output tokens and the
length of the generation window.

```
输出 21.6 字/s · 128 字 · 5.90s          ← while streaming
上次 23.5 tok/s · 首字 0.04s · 12 tok · 生成 0.51s
```

**中文**：在输入框上方显示模型输出速度。生成中按字符/秒实时刷新，结束后给出 tok/s、首字延迟（TTFT）、输出 token 数和生成窗口时长。用 `/speed` 显示或隐藏。

## How the rate is measured

Total wall time folds queueing and prefill into the rate, so a slow gateway
reads as a slow model. This mod separates the two:

- **TTFT** — from the request going out to the first streamed chunk.
- **tok/s** — `output_tokens` from the API's own usage report, divided by the
  generation window: first streamed chunk to last. Not total turn time.
- **字/s** — the same window, counted in characters, because the token count
  is only known once the response stops.

A streamed chunk counts whether it is visible text, thinking, or a tool call's
arguments. Windows shorter than 150 ms report no rate, so a two-word answer
does not print a meaningless 400 tok/s.

## Install

At the prompt of a terminal session:

```
/plugin install output-speed --marketplace enakzzz/output-speed
```

From a shell:

```
claude plugin install output-speed --marketplace enakzzz/output-speed
```

In the desktop app, where `/plugin` does not run: click **+** next to the
prompt box, then **Plugins**, **Add marketplace** with `enakzzz/output-speed`,
then **Add plugin**.

## Usage

- The line appears above the prompt after the first model request of the
  session. It is drawn on the terminal and desktop surfaces.
- `/speed` toggles it, and prints the last measurement as command output.
- The band's own `[-]` mark collapses it for a while without turning it off.

Per-request numbers are what matter: one turn can make several model requests
(tool loops), and the readout follows the most recent one.

## Notes

- The readout's labels are in Chinese (`输出` = streaming, `上次` = last).
- Written and tested against Claude Code 2.1.308. The hooks API is early
  access and may change between releases.

## Development

```
claude plugin validate .
claude plugin test .
tsc -p .
```

`tsc -p .` needs `.claude-plugin/types/`, which Claude Code lays down the first
time it loads the mod from this folder.

## License

MIT — see [LICENSE](LICENSE).
