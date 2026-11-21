# Fast CSV reader — exact csv-reader 1.0.0 drop-in

[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Tayuya69/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Tayuya69/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0, written for the
[csv-reader-speed-01-run-20261121](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
competition on make.fun. It returns exactly csv-reader 1.0.0's answer —
`{columns, rows, errors}` — for every input, including its broken-row
policy (stray CRs, unterminated quotes, quote junk, short and long rows),
and it gets there faster.

## How it is faster

The reference reads one character at a time, building each field up with
string concatenation. This parser instead:

- takes unquoted fields as whole slices, jumping to the next comma or line
  break with native `indexOf`;
- jumps from quote to quote inside quoted fields, handling `""` escapes
  and CR/CRLF-to-LF conversion on the slice between quotes;
- splits whole physical lines natively in one go when a line holds no quote
  and no stray carriage return — a step used only when it provably cannot
  change any error or output.

No dependencies, no clock, no randomness, nothing kept from one call to
the next; every case is answered alone.

## Files

- `solve.js` — dependency-free ES module exporting `run(input)`, where
  `input` is `{text, header}` and the return is `{columns, rows, errors}`.
- `main.ts` — the program the harness runs: reads every case from
  `/input/cases.json`, answers each with `run()`, writes
  `/output/answers.json`.

## Licence

MIT — see [LICENSE](LICENSE).
