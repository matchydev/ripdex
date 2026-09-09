/**
 * RIPDEX art pipeline — edit / reference.
 *
 *   pnpm art:edit -- \
 *     --input public/art/packs/grail-pack.png \
 *     --prompt art-prompts/grail-pack-v2.md \
 *     --out public/art/packs/grail-pack-v2.png
 *
 * Prefer editing over a fresh generation when an asset is already close, when
 * visual identity must stay consistent (e.g. a second pack in an established
 * family), or when only the background/composition/lighting needs work. Do not
 * reroll good artwork unnecessarily.
 *
 * --input   source image (repeatable: pass --input twice to supply references)
 * --prompt  a brief file or inline instruction describing the change
 * --out     destination path (required)
 * --mask    optional PNG mask (alpha channel marks the region to change)
 * --size / --quality / --transparent / --background / --format / --model / --draft
 *           same meaning as art:generate
 *
 * The OpenAI API key is read from process.env.OPENAI_API_KEY only and is never
 * printed. If it is absent, this exits without editing.
 */

import { loadBrief } from './art-prompt.ts';
import {
  editImage,
  writeImage,
  normalizeSize,
  hasKey,
  IMAGE_MODEL,
  DRAFT_MODEL,
  type Quality,
  type Background,
  type OutputFormat,
} from './openai-common.ts';

function parseArgs(argv: string[]): { flags: Record<string, string>; inputs: string[]; bools: Set<string> } {
  const flags: Record<string, string> = {};
  const inputs: string[] = [];
  const bools = new Set<string>();
  const KNOWN_BOOL = new Set(['transparent', 'draft']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue; // pnpm forwards the bare separator; ignore it
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (KNOWN_BOOL.has(key)) bools.add(key);
    else if (key === 'input') inputs.push(argv[++i] ?? '');
    else flags[key] = argv[++i] ?? '';
  }
  return { flags, inputs, bools };
}

async function main(): Promise<void> {
  const { flags, inputs, bools } = parseArgs(process.argv.slice(2));

  if (inputs.length === 0 || !flags.prompt || !flags.out) {
    console.error('Usage: pnpm art:edit -- --input <img> [--input <img2>] --prompt <brief|text> --out <path> [--mask m] [--size WxH] [--quality q] [--transparent] [--model m] [--draft]');
    process.exit(2);
  }

  // SECURITY: never proceed without a key, and never print it.
  if (!hasKey()) {
    console.error('OPENAI_API_KEY is not set — image editing is disabled.');
    console.error('Set OPENAI_API_KEY in the environment and retry. The key is never printed or committed.');
    process.exit(1);
  }

  const brief = await loadBrief(flags.prompt);
  const draft = bools.has('draft');

  const model = flags.model || brief.meta.model || (draft ? DRAFT_MODEL : IMAGE_MODEL);
  const sizeInput = flags.size || brief.meta.size;
  const size = sizeInput ? normalizeSize(sizeInput).size : undefined;
  const quality = (flags.quality || brief.meta.quality || (draft ? 'medium' : 'high')) as Quality;
  const transparent = bools.has('transparent') || brief.meta.background === 'transparent';
  const background = (transparent ? 'transparent' : (flags.background || brief.meta.background)) as Background | undefined;
  const outputFormat = (transparent ? 'png' : (flags.format || brief.meta.format || 'png')) as OutputFormat;

  console.log(`RIPDEX art:edit`);
  console.log(`  inputs  : ${inputs.join(', ')}`);
  if (flags.mask) console.log(`  mask    : ${flags.mask}`);
  console.log(`  brief   : ${brief.source}`);
  console.log(`  model   : ${model}${draft ? ' (draft)' : ''}`);
  console.log(`  size    : ${size ?? 'inherit'}   quality: ${quality}   bg: ${background ?? 'default'}   format: ${outputFormat}`);
  console.log(`  out     : ${flags.out}`);
  console.log(`  … requesting edit from OpenAI`);

  const buffers = await editImage({
    prompt: brief.prompt,
    images: inputs,
    mask: flags.mask,
    size,
    quality,
    background,
    outputFormat,
    model,
  });

  await writeImage(buffers[0], flags.out);
  console.log(`  ✓ wrote ${flags.out}  (${(buffers[0].length / 1024).toFixed(0)} KB)`);
  console.log('Done. Re-open the site and inspect the actual composition in place.');
}

main().catch((err) => {
  console.error(`\nart:edit failed: ${err instanceof Error ? err.message : String(err)}`);
  // Set exitCode rather than process.exit() so pending async handles close
  // cleanly (a hard exit mid-fetch trips a libuv assertion on Windows).
  process.exitCode = 1;
});
