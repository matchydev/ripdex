/**
 * RIPDEX art pipeline — generate.
 *
 *   pnpm art:generate -- \
 *     --prompt art-prompts/grail-pack.md \
 *     --out public/art/packs/grail-pack.png \
 *     --size 1024x1536 --quality high --transparent
 *
 * --prompt   a brief file (art-prompts/*.md) or an inline prompt string
 * --out      destination path (required)
 * --size     WxH, "auto", or a preset (pack, hero, wide, section, og, social, badge, texture, square)
 * --quality  low | medium | high | xhigh | max | auto     (default high; draft uses medium)
 * --background transparent | opaque | auto
 * --transparent  shorthand for --background transparent (+ png output)
 * --format   png | jpeg | webp                            (default png)
 * --model    override the model id
 * --draft    use the fast/cheaper draft model at lower quality
 * --n        number of images (writes -1, -2… suffixes for n>1)
 *
 * The OpenAI API key is read from process.env.OPENAI_API_KEY only. If it is not
 * set, this prints that fact and exits without generating. The key is never
 * printed.
 */

import { loadBrief } from './art-prompt.ts';
import {
  generateImage,
  writeImage,
  normalizeSize,
  hasKey,
  IMAGE_MODEL,
  DRAFT_MODEL,
  type Quality,
  type Background,
  type OutputFormat,
} from './openai-common.ts';

interface Args {
  flags: Record<string, string>;
  bools: Set<string>;
}

function parseArgs(argv: string[]): Args {
  const flags: Record<string, string> = {};
  const bools = new Set<string>();
  const KNOWN_BOOL = new Set(['transparent', 'draft']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue; // pnpm forwards the bare separator; ignore it
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (KNOWN_BOOL.has(key)) {
      bools.add(key);
    } else {
      flags[key] = argv[++i] ?? '';
    }
  }
  return { flags, bools };
}

function suffixed(outPath: string, i: number): string {
  const dot = outPath.lastIndexOf('.');
  return dot === -1 ? `${outPath}-${i}` : `${outPath.slice(0, dot)}-${i}${outPath.slice(dot)}`;
}

async function main(): Promise<void> {
  const { flags, bools } = parseArgs(process.argv.slice(2));

  if (!flags.prompt || !flags.out) {
    console.error('Usage: pnpm art:generate -- --prompt <brief|text> --out <path> [--size WxH] [--quality q] [--transparent] [--format f] [--model m] [--draft] [--n N]');
    process.exit(2);
  }

  // SECURITY: never proceed without a key, and never print it.
  if (!hasKey()) {
    console.error('OPENAI_API_KEY is not set — image generation is disabled.');
    console.error('Set OPENAI_API_KEY in the environment and retry. The key is read from');
    console.error('process.env only and is never printed, logged, or committed.');
    process.exit(1);
  }

  const brief = await loadBrief(flags.prompt);
  const draft = bools.has('draft');

  const model = flags.model || brief.meta.model || (draft ? DRAFT_MODEL : IMAGE_MODEL);
  const sizeInput = flags.size || brief.meta.size || 'pack';
  const { size, note } = normalizeSize(sizeInput);
  const quality = (flags.quality || brief.meta.quality || (draft ? 'medium' : 'high')) as Quality;
  const transparent = bools.has('transparent') || brief.meta.background === 'transparent';
  const background = (transparent ? 'transparent' : (flags.background || brief.meta.background)) as Background | undefined;
  const outputFormat = (transparent ? 'png' : (flags.format || brief.meta.format || 'png')) as OutputFormat;
  const n = Math.max(1, Number(flags.n ?? '1') || 1);

  console.log(`RIPDEX art:generate`);
  console.log(`  brief   : ${brief.source}`);
  console.log(`  model   : ${model}${draft ? ' (draft)' : ''}`);
  console.log(`  size    : ${size}${note ? '  [' + note + ']' : ''}`);
  console.log(`  quality : ${quality}`);
  console.log(`  bg      : ${background ?? 'default'}   format: ${outputFormat}`);
  console.log(`  out     : ${flags.out}${n > 1 ? `  (x${n})` : ''}`);
  console.log(`  … requesting from OpenAI (this can take 10–60s at high quality)`);

  const buffers = await generateImage({ prompt: brief.prompt, size, quality, background, outputFormat, model, n });

  for (let i = 0; i < buffers.length; i++) {
    const dest = buffers.length === 1 ? flags.out : suffixed(flags.out, i + 1);
    await writeImage(buffers[i], dest);
    console.log(`  ✓ wrote ${dest}  (${(buffers[i].length / 1024).toFixed(0)} KB)`);
  }
  console.log('Done. Inspect the asset, implement it, open the site, and edit/regenerate if the composition is weak.');
}

main().catch((err) => {
  console.error(`\nart:generate failed: ${err instanceof Error ? err.message : String(err)}`);
  // Set exitCode rather than process.exit() so pending async handles close
  // cleanly (a hard exit mid-fetch trips a libuv assertion on Windows).
  process.exitCode = 1;
});
