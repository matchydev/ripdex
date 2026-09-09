/**
 * RIPDEX art pipeline — shared OpenAI image client.
 *
 * Visual-production infrastructure only. This never touches pricing, randomness,
 * the ledger, pack pools, card identity, or the catalog provider — it renders
 * the surrounding RIPDEX visual universe (pack wrappers, environments,
 * achievement medals, social backgrounds, textures) and writes finished image
 * files to disk.
 *
 * Zero dependencies by design (RIPDEX runs TypeScript directly, no build step):
 * we call the OpenAI HTTPS API with Node's built-in fetch/FormData/Blob/Buffer.
 *
 * SECURITY — the API key:
 *   - Read ONLY from process.env.OPENAI_API_KEY, and only inside the request.
 *   - Never printed, returned, logged, written to disk, or sent to the browser.
 *   - hasKey() reports presence as a boolean and nothing more.
 *   - If the key is absent, generation stops with a clear message.
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, basename } from 'node:path';

const API_BASE = 'https://api.openai.com/v1';

/**
 * The image model. Centralized so it can change without rewriting the tool.
 * Default is the current highest-quality GPT Image model; override with
 * OPENAI_IMAGE_MODEL. `gpt-image-2.5-flare` is the faster/cheaper draft model.
 */
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst';
export const DRAFT_MODEL = process.env.OPENAI_IMAGE_DRAFT_MODEL || 'gpt-image-2.5-flare';

export type Quality = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'auto';
export type Background = 'transparent' | 'opaque' | 'auto';
export type OutputFormat = 'png' | 'jpeg' | 'webp';

const CANONICAL_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536', 'auto']);

/**
 * Named size presets for RIPDEX asset purposes. The GPT Image API accepts
 * arbitrary WIDTHxHEIGHT where both are multiples of 16 and the aspect ratio is
 * between 1:3 and 3:1, so these are real targets, not forced squares.
 */
export const SIZE_PRESETS: Record<string, string> = {
  square: '1024x1024',
  pack: '1024x1536', // portrait sealed-wrapper source
  hero: '1920x1088', // wide website hero (~16:9)
  wide: '1920x1088',
  section: '1920x960', // full-width section band (2:1)
  og: '1200x640', // Open Graph (~1200x630, rounded to a multiple of 16)
  social: '1600x900', // X / social art
  badge: '1024x1024', // achievement medal, transparent
  texture: '1024x1024', // seamless-ish texture source
};

/** Whether the key is available. The ONLY thing this module tells you about it. */
export function hasKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export class MissingKeyError extends Error {
  constructor() {
    super(
      'OPENAI_API_KEY is not set. Image generation is disabled. ' +
        'Set OPENAI_API_KEY in the environment and retry — the key is read from ' +
        'process.env only and is never printed, logged, or committed.',
    );
    this.name = 'MissingKeyError';
  }
}

function requireKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new MissingKeyError();
  return key;
}

const round16 = (n: number): number => Math.max(256, Math.round(n / 16) * 16);

/**
 * Validate/normalize a size string to something the API accepts. Canonical
 * sizes and "auto" pass through. A custom WxH is clamped to [256, 3840] per
 * edge, rounded to a multiple of 16, and nudged to keep the aspect within
 * 1:3..3:1. Returns the normalized size and whether it was adjusted.
 */
export function normalizeSize(size: string | undefined): { size: string; note?: string } {
  if (!size || CANONICAL_SIZES.has(size)) return { size: size || 'auto' };
  const preset = SIZE_PRESETS[size];
  const raw = preset ?? size;
  const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(raw);
  if (!m) throw new Error(`Unrecognized size "${size}". Use WxH, "auto", or a preset: ${Object.keys(SIZE_PRESETS).join(', ')}`);
  let w = Math.min(3840, round16(Number(m[1])));
  let h = Math.min(3840, round16(Number(m[2])));
  // Enforce aspect ratio between 1:3 and 3:1.
  const maxRatio = 3;
  if (w / h > maxRatio) w = round16(h * maxRatio);
  if (h / w > maxRatio) h = round16(w * maxRatio);
  const normalized = `${w}x${h}`;
  const note = normalized !== raw ? `size ${preset ? size + ' (' + preset + ')' : size} normalized to ${normalized}` : undefined;
  return { size: normalized, note };
}

function mimeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

/** Turn a failed response into an Error whose message carries the API's reason
 *  (which never contains the key) — so a caller sees why without exposing creds. */
async function apiError(res: Response): Promise<Error> {
  let detail = '';
  try {
    const text = await res.text();
    try {
      detail = JSON.parse(text)?.error?.message ?? text;
    } catch {
      detail = text;
    }
  } catch {
    /* ignore */
  }
  return new Error(`OpenAI image API ${res.status} ${res.statusText}: ${detail.slice(0, 600)}`);
}

export interface GenerateOptions {
  prompt: string;
  size?: string;
  quality?: Quality;
  background?: Background;
  outputFormat?: OutputFormat;
  model?: string;
  n?: number;
}

/** POST /v1/images/generations. Returns decoded image buffers (base64 → Buffer). */
export async function generateImage(opts: GenerateOptions): Promise<Buffer[]> {
  const key = requireKey();
  const { size } = normalizeSize(opts.size);
  const body: Record<string, unknown> = {
    model: opts.model || IMAGE_MODEL,
    prompt: opts.prompt,
    size,
    quality: opts.quality || 'high',
    n: opts.n ?? 1,
  };
  if (opts.background) body.background = opts.background;
  if (opts.outputFormat) body.output_format = opts.outputFormat;

  const res = await fetch(`${API_BASE}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await apiError(res);
  const data = (await res.json()) as { data?: { b64_json?: string }[] };
  const out = (data.data ?? []).map((d) => Buffer.from(d.b64_json ?? '', 'base64'));
  if (out.length === 0 || out[0].length === 0) throw new Error('OpenAI returned no image data.');
  return out;
}

export interface EditOptions {
  prompt: string;
  images: string[]; // one or more reference/source image paths
  mask?: string;
  size?: string;
  quality?: Quality;
  background?: Background;
  outputFormat?: OutputFormat;
  model?: string;
}

/** POST /v1/images/edits (multipart). Edits/extends existing artwork so RIPDEX's
 *  visual identity stays consistent instead of rerolling good assets. */
export async function editImage(opts: EditOptions): Promise<Buffer[]> {
  const key = requireKey();
  const form = new FormData();
  form.set('model', opts.model || IMAGE_MODEL);
  form.set('prompt', opts.prompt);
  for (const path of opts.images) {
    const buf = await readFile(path);
    form.append('image[]', new Blob([buf], { type: mimeFor(path) }), basename(path));
  }
  if (opts.mask) {
    const buf = await readFile(opts.mask);
    form.set('mask', new Blob([buf], { type: 'image/png' }), basename(opts.mask));
  }
  if (opts.size) form.set('size', normalizeSize(opts.size).size);
  if (opts.quality) form.set('quality', opts.quality);
  if (opts.background) form.set('background', opts.background);
  if (opts.outputFormat) form.set('output_format', opts.outputFormat);

  const res = await fetch(`${API_BASE}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` }, // fetch sets the multipart boundary
    body: form,
  });
  if (!res.ok) throw await apiError(res);
  const data = (await res.json()) as { data?: { b64_json?: string }[] };
  const out = (data.data ?? []).map((d) => Buffer.from(d.b64_json ?? '', 'base64'));
  if (out.length === 0 || out[0].length === 0) throw new Error('OpenAI returned no image data.');
  return out;
}

/** Write an image buffer to disk, creating parent directories as needed. */
export async function writeImage(buffer: Buffer, outPath: string): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buffer);
}
