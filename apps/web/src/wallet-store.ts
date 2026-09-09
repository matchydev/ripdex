/**
 * The $RIP balance + portfolio store (economy layer).
 *
 * Server-authoritative, per demo wallet: a $RIP balance and the set of owned
 * pulls, each sellable once for its frozen sell value. Ripping spends $RIP;
 * selling credits the pull's frozen sell value back. This is the web app's
 * economy and never touches the provably-fair ledger, pricing, or card identity
 * — the ledger still records every opening exactly as before.
 *
 * Persisted to a JSON file so balances survive a restart. The in-memory state is
 * authoritative and mutated synchronously within a request; writes are coalesced.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const STARTING_BALANCE = Number(process.env.RIPDEX_START_BALANCE ?? 1_000_000);

interface Pull {
  sellValue: number;
  sold: boolean;
}
interface WalletState {
  balance: number;
  pulls: Record<string, Pull>;
}

export type SellResult =
  | { ok: true; credited: number; balance: number }
  | { ok: false; reason: 'not-owned' | 'already-sold' };

export class WalletStore {
  private readonly state: Map<string, WalletState>;
  private readonly path: string;
  private writing = false;
  private pending: string | null = null;

  private constructor(path: string, state: Map<string, WalletState>) {
    this.path = path;
    this.state = state;
  }

  static async open(path: string): Promise<WalletStore> {
    let state = new Map<string, WalletState>();
    try {
      const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, WalletState>;
      state = new Map(Object.entries(raw));
    } catch {
      // No file yet, or corrupt — start fresh. A wallet's balance is not a
      // provably-fair record, so a rebuild-from-empty is acceptable here.
    }
    return new WalletStore(path, state);
  }

  private ensure(wallet: string): WalletState {
    let w = this.state.get(wallet);
    if (!w) {
      w = { balance: STARTING_BALANCE, pulls: {} };
      this.state.set(wallet, w);
    }
    return w;
  }

  balance(wallet: string): number {
    return this.ensure(wallet).balance;
  }

  /** Spend `cost` $RIP. Returns the new balance, or null if unaffordable. */
  spend(wallet: string, cost: number): number | null {
    const w = this.ensure(wallet);
    if (w.balance < cost) return null;
    w.balance -= cost;
    this.persist();
    return w.balance;
  }

  /** Credit `amount` $RIP (a refund when a rip fails after debiting). */
  credit(wallet: string, amount: number): number {
    const w = this.ensure(wallet);
    w.balance += amount;
    this.persist();
    return w.balance;
  }

  /** Record an owned, sellable pull (idempotent per openingId). */
  recordPull(wallet: string, openingId: string, sellValue: number): void {
    const w = this.ensure(wallet);
    if (!w.pulls[openingId]) {
      w.pulls[openingId] = { sellValue, sold: false };
      this.persist();
    }
  }

  /** Sell a pull for its frozen value. Idempotent-safe: a second sell is refused. */
  sell(wallet: string, openingId: string): SellResult {
    const w = this.ensure(wallet);
    const pull = w.pulls[openingId];
    if (!pull) return { ok: false, reason: 'not-owned' };
    if (pull.sold) return { ok: false, reason: 'already-sold' };
    pull.sold = true;
    w.balance += pull.sellValue;
    this.persist();
    return { ok: true, credited: pull.sellValue, balance: w.balance };
  }

  /** Coalesced async write — the in-memory state is the source of truth. */
  private persist(): void {
    this.pending = JSON.stringify(Object.fromEntries(this.state));
    if (this.writing) return;
    this.writing = true;
    void (async () => {
      try {
        await mkdir(dirname(this.path), { recursive: true });
        while (this.pending !== null) {
          const data = this.pending;
          this.pending = null;
          await writeFile(this.path, data, 'utf8');
        }
      } catch {
        /* a failed balance write is non-fatal; memory stays authoritative */
      } finally {
        this.writing = false;
      }
    })();
  }
}
