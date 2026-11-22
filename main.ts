// Driver for the csv-reader speed entry: reads every case, answers each
// one alone with run() from solve.js, and writes the answers out.
// Runs on Node 22+, which executes this TypeScript directly.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setFlagsFromString } from 'node:v8';

// Keep V8's incremental marking off for all of solve.js, as the house
// baseline does: the flag has to be set before the module is imported.
setFlagsFromString('--no-incremental-marking');

type Runner = (input: unknown) => unknown;
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as { run: Runner };

const inputDir = process.env.MAKEFUN_INPUT_DIR || '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

type Case = { id: string; input: unknown };
let raw: string | null = fs.readFileSync(path.join(inputDir, 'cases.json'), 'utf8');
const cases = JSON.parse(raw) as (Case | undefined)[];
raw = null; // the file text is no longer needed once parsed

// Stringify each case's answer as it is produced, instead of holding all
// six answers and stringifying them at once: the answers are large, and
// keeping only one case's answer objects live at a time keeps the heap
// small. The bytes are identical to stringifying the whole array, since
// JSON.stringify([a, b]) is "[" + JSON.stringify(a) + "," +
// JSON.stringify(b) + "]".
const parts: string[] = ['['];
for (let i = 0; i < cases.length; i++) {
  const c = cases[i] as Case;
  if (i > 0) parts.push(',');
  parts.push(JSON.stringify(run(c.input)));
  cases[i] = undefined; // release the case's input text
}
parts.push(']');
fs.writeFileSync(path.join(outputDir, 'answers.json'), parts.join(''));
