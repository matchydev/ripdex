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

export interface Pull {
  openingId: string;
  name: string;
  setId: string;
  number: string;
  img: string;
  tier: string;
  grade: number;
  gradeLabel: string;
  gradedValue: number;
  sellValue: number;
  sold: boolean;
  at: string;
}
/** What the rip handler records; `sold` is set to false by the store. */
export type PullInput = Omit<Pull, 'sold'>;

interface WalletState {
  balance: number;
  spent: number;
  earned: number;
  pulls: Record<string, Pull>;
}

export interface Profile {
  balance: number;
  spent: number;
  earned: number;
  /** earned - spent, i.e. your session P&L against the starting balance. */
  net: number;
  packsOpened: number;
  grails: number;
  owned: Pull[];
  sold: Pull[];
  best: Pull | null;
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
      w = { balance: STARTING_BALANCE, spent: 0, earned: 0, pulls: {} };
      this.state.set(wallet, w);
    }
    // Backfill counters for wallets persisted before they existed.
    if (typeof w.spent !== 'number') w.spent = 0;
    if (typeof w.earned !== 'number') w.earned = 0;
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
    w.spent += cost;
    this.persist();
    return w.balance;
  }

  /** Credit `amount` $RIP (a refund when a rip fails after debiting). */
  credit(wallet: string, amount: number): number {
    const w = this.ensure(wallet);
    w.balance += amount;
    // A refund undoes a spend, so it should not count against lifetime spend.
    w.spent = Math.max(0, w.spent - amount);
    this.persist();
    return w.balance;
  }

  /** Record an owned, sellable pull (idempotent per openingId). */
  recordPull(wallet: string, pull: PullInput): void {
    const w = this.ensure(wallet);
    if (!w.pulls[pull.openingId]) {
      w.pulls[pull.openingId] = { ...pull, sold: false };
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
    w.earned += pull.sellValue;
    this.persist();
    return { ok: true, credited: pull.sellValue, balance: w.balance };
  }

  /** A snapshot of the wallet for the profile panel. */
  profile(wallet: string): Profile {
    const w = this.ensure(wallet);
    const pulls = Object.values(w.pulls);
    // Newest first — pulls carry an ISO `at`, and insertion order is a fallback.
    const byRecency = (a: Pull, b: Pull): number => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
    const owned = pulls.filter((p) => !p.sold).sort(byRecency);
    const sold = pulls.filter((p) => p.sold).sort(byRecency);
    const grails = pulls.filter((p) => p.tier === 'GRAIL').length;
    const best = pulls.reduce<Pull | null>(
      (top, p) => (top === null || p.gradedValue > top.gradedValue ? p : top),
      null,
    );
    return {
      balance: w.balance,
      spent: w.spent,
      earned: w.earned,
      net: w.earned - w.spent,
      packsOpened: pulls.length,
      grails,
      owned,
      sold,
      best,
    };
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
