/**
 * Provably-fair randomness (spec §17 step 5).
 *
 * Commit-reveal, the scheme players already know how to audit:
 *   1. Server generates serverSeed, publishes sha256(serverSeed) BEFORE the open.
 *   2. Player supplies (or accepts a default) clientSeed.
 *   3. Each open uses an incrementing nonce.
 *   4. Outcome = HMAC-SHA256(serverSeed, "clientSeed:nonce:cursor").
 *   5. Server later reveals serverSeed; anyone can recompute every draw.
 *
 * The float derivation is the standard 13-hex-char / 2^52 method so a third
 * party can verify results in any language without porting our code.
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';

export interface SeedCommitment {
  /** Kept secret until reveal. */
  serverSeed: string;
  /** Published before any open that uses this seed. */
  serverSeedHash: string;
}

export function createSeedCommitment(): SeedCommitment {
  const serverSeed = randomBytes(32).toString('hex');
  return { serverSeed, serverSeedHash: sha256(serverSeed) };
}

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function verifySeedCommitment(serverSeed: string, serverSeedHash: string): boolean {
  return sha256(serverSeed) === serverSeedHash;
}

export interface DrawInputs {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

/** Raw HMAC digest for one cursor position. */
export function digestFor(inputs: DrawInputs, cursor: number): string {
  return createHmac('sha256', inputs.serverSeed)
    .update(`${inputs.clientSeed}:${inputs.nonce}:${cursor}`, 'utf8')
    .digest('hex');
}

/**
 * Uniform float in [0, 1). 13 hex chars is 52 bits, which is exactly the
 * mantissa of a double, so every representable value is reachable and the
 * distribution has no gaps.
 */
export function floatAt(inputs: DrawInputs, cursor: number): number {
  const hex = digestFor(inputs, cursor).slice(0, 13);
  return parseInt(hex, 16) / 2 ** 52;
}

/** `count` independent uniforms for a multi-card pack. */
export function deriveFloats(inputs: DrawInputs, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(floatAt(inputs, i));
  return out;
}
