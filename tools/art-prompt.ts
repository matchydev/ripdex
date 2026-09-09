/**
 * RIPDEX art pipeline — brief loader.
 *
 * Every important asset is generated from a written brief (a markdown file in
 * art-prompts/), never an ad-hoc "cool crypto image" string. A brief is prose
 * that defines purpose, subject, composition, camera, lighting, material,
 * visual language, texture, colour, negative space and output — see
 * art-direction/ART_DIRECTION.md.
 *
 * A brief MAY start with a metadata block so the recommended generation
 * settings travel with the brief:
 *
 *   <!-- ripdex-art
 *   size: 1024x1536
 *   quality: high
 *   background: transparent
 *   format: png
 *   model: gpt-image-2.5-sunburst
 *   -->
 *
 * CLI flags override the brief's metadata; the brief's metadata overrides the
 * tool defaults.
 */

import { readFile, stat } from 'node:fs/promises';

export interface BriefMeta {
  size?: string;
  quality?: string;
  background?: string;
  format?: string;
  model?: string;
}

export interface Brief {
  prompt: string;
  meta: BriefMeta;
  source: string; // "file:<path>" or "inline"
}

const META_RE = /^\s*<!--\s*ripdex-art\s*([\s\S]*?)-->\s*/i;

function parseMeta(block: string): BriefMeta {
  const meta: BriefMeta = {};
  for (const line of block.split('\n')) {
    const m = /^\s*([a-z_]+)\s*:\s*(.+?)\s*$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'size') meta.size = val;
    else if (key === 'quality') meta.quality = val;
    else if (key === 'background') meta.background = val;
    else if (key === 'format') meta.format = val;
    else if (key === 'model') meta.model = val;
  }
  return meta;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve `input` into a prompt + metadata. If it names an existing file, the
 * file is read and its optional metadata header parsed; otherwise the string is
 * treated as an inline prompt. The metadata comment is stripped from the prompt
 * text sent to the model.
 */
export async function loadBrief(input: string): Promise<Brief> {
  if (await isFile(input)) {
    const raw = await readFile(input, 'utf8');
    const m = META_RE.exec(raw);
    const meta = m ? parseMeta(m[1]) : {};
    const prompt = (m ? raw.slice(m[0].length) : raw).trim();
    if (!prompt) throw new Error(`Brief ${input} has no prompt body.`);
    return { prompt, meta, source: `file:${input}` };
  }
  const prompt = input.trim();
  if (!prompt) throw new Error('Empty prompt.');
  return { prompt, meta: {}, source: 'inline' };
}
