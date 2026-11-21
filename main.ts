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

const cases = JSON.parse(fs.readFileSync(path.join(inputDir, 'cases.json'), 'utf8')) as Array<{
  id: string;
  input: unknown;
}>;

const answers = cases.map((c) => run(c.input));
fs.writeFileSync(path.join(outputDir, 'answers.json'), JSON.stringify(answers));
