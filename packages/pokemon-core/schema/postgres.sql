-- RIPDEX catalog schema (spec §2, §16, §17).
--
-- The shape JsonCatalogStore stands in for. The important structural claim is
-- that pack pools, prices, and collection rows all reference
-- pokemon_card_variant.variant_id — never pokemon_card.card_id — so it is not
-- possible to express "a Charizard" without saying which printing.

BEGIN;

CREATE TABLE pokemon_set (
  set_id         TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  series         TEXT NOT NULL,
  symbol_url     TEXT,
  logo_url       TEXT,
  release_date   DATE,
  total          INTEGER,
  printed_total  INTEGER,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pokemon_card (
  card_id                  TEXT PRIMARY KEY,
  set_id                   TEXT NOT NULL REFERENCES pokemon_set(set_id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  supertype                TEXT NOT NULL,
  subtypes                 TEXT[] NOT NULL DEFAULT '{}',
  types                    TEXT[] NOT NULL DEFAULT '{}',
  hp                       INTEGER,
  evolves_from             TEXT,
  evolves_to               TEXT[] NOT NULL DEFAULT '{}',
  rules                    TEXT[] NOT NULL DEFAULT '{}',
  attacks                  JSONB NOT NULL DEFAULT '[]',
  weaknesses               JSONB NOT NULL DEFAULT '[]',
  resistances              JSONB NOT NULL DEFAULT '[]',
  retreat_cost             TEXT[] NOT NULL DEFAULT '{}',
  converted_retreat_cost   INTEGER,
  -- Text, not integer: "SV107", "TG12", "199/165" all occur.
  number                   TEXT NOT NULL,
  artist                   TEXT,
  rarity                   TEXT,
  flavor_text              TEXT,
  national_pokedex_numbers INTEGER[] NOT NULL DEFAULT '{}',
  legalities               JSONB NOT NULL DEFAULT '{}',
  image_small              TEXT NOT NULL,
  image_large              TEXT NOT NULL,
  source_provider          TEXT NOT NULL,
  source_fetched_at        TIMESTAMPTZ NOT NULL,
  UNIQUE (set_id, number)
);

CREATE INDEX pokemon_card_name_idx   ON pokemon_card USING GIN (to_tsvector('simple', name));
CREATE INDEX pokemon_card_set_idx    ON pokemon_card (set_id);
CREATE INDEX pokemon_card_rarity_idx ON pokemon_card (rarity);
CREATE INDEX pokemon_card_dex_idx    ON pokemon_card USING GIN (national_pokedex_numbers);

-- The canonical variant (spec §16). variant_id is
-- '<set_id>|<number>|<finish>|<printing>' and is the only identity the rest of
-- the application is allowed to hold.
CREATE TABLE pokemon_card_variant (
  variant_id  TEXT PRIMARY KEY,
  card_id     TEXT NOT NULL REFERENCES pokemon_card(card_id) ON DELETE CASCADE,
  set_id      TEXT NOT NULL,
  number      TEXT NOT NULL,
  finish      TEXT NOT NULL CHECK (finish   IN ('non-foil', 'holofoil', 'reverse-holofoil')),
  printing    TEXT NOT NULL CHECK (printing IN ('unlimited', '1st-edition', 'shadowless')),
  -- 'inferred' means no pricing provider has confirmed this variant exists.
  -- Such a variant must not enter a pack pool: see the trigger below.
  confidence  TEXT NOT NULL CHECK (confidence IN ('reported', 'inferred')),
  UNIQUE (set_id, number, finish, printing),
  CHECK (variant_id = set_id || '|' || number || '|' || finish || '|' || printing)
);

CREATE INDEX pokemon_card_variant_card_idx ON pokemon_card_variant (card_id);

-- Append-only observations, one row per variant per day. This is what §8's
-- 24h / 7d / 30d movement reads.
CREATE TABLE pokemon_price_observation (
  variant_id        TEXT NOT NULL REFERENCES pokemon_card_variant(variant_id) ON DELETE CASCADE,
  observed_on       DATE NOT NULL,
  low               NUMERIC(12,2),
  mid               NUMERIC(12,2),
  high              NUMERIC(12,2),
  market            NUMERIC(12,2),
  reference_value   NUMERIC(12,2) NOT NULL CHECK (reference_value > 0),
  basis             TEXT NOT NULL CHECK (basis IN ('market', 'mid', 'low')),
  currency          TEXT NOT NULL,
  source            TEXT NOT NULL,
  source_url        TEXT,
  source_updated_at TIMESTAMPTZ,
  PRIMARY KEY (variant_id, observed_on)
);

CREATE INDEX price_observation_recent_idx ON pokemon_price_observation (variant_id, observed_on DESC);

-- ---------------------------------------------------------------- packs

CREATE TABLE pack_config (
  pack_id                     TEXT NOT NULL,
  version                     TEXT NOT NULL,
  name                        TEXT NOT NULL,
  cards_per_pack              INTEGER NOT NULL CHECK (cards_per_pack >= 1),
  price_rip                   NUMERIC(78,0) NOT NULL,
  distribution_model          JSONB NOT NULL,
  artwork                     JSONB NOT NULL,
  allow_duplicates_within_pack BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pack_id, version)
);

CREATE TABLE pack_pool_entry (
  pack_id     TEXT NOT NULL,
  version     TEXT NOT NULL,
  variant_id  TEXT NOT NULL REFERENCES pokemon_card_variant(variant_id),
  weight      BIGINT NOT NULL CHECK (weight > 0),
  PRIMARY KEY (pack_id, version, variant_id),
  FOREIGN KEY (pack_id, version) REFERENCES pack_config(pack_id, version) ON DELETE CASCADE
);

-- A pool entry whose variant nobody has confirmed has no trustworthy price,
-- and therefore no trustworthy tier or odds display.
CREATE OR REPLACE FUNCTION pack_pool_entry_requires_reported_variant()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT confidence FROM pokemon_card_variant WHERE variant_id = NEW.variant_id) <> 'reported' THEN
    RAISE EXCEPTION 'variant % is not confirmed by a pricing provider and cannot enter a pack pool', NEW.variant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pack_pool_entry_confidence
  BEFORE INSERT OR UPDATE ON pack_pool_entry
  FOR EACH ROW EXECUTE FUNCTION pack_pool_entry_requires_reported_variant();

-- ---------------------------------------------------------------- snapshots

CREATE TABLE price_snapshot (
  snapshot_id  TEXT PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL,
  valid_until  TIMESTAMPTZ NOT NULL,
  currency     TEXT NOT NULL,
  provider     TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  CHECK (valid_until > created_at)
);

CREATE TABLE price_snapshot_entry (
  snapshot_id     TEXT NOT NULL REFERENCES price_snapshot(snapshot_id) ON DELETE CASCADE,
  variant_id      TEXT NOT NULL REFERENCES pokemon_card_variant(variant_id),
  reference_value NUMERIC(12,2) NOT NULL,
  basis           TEXT NOT NULL,
  quote           JSONB NOT NULL,
  PRIMARY KEY (snapshot_id, variant_id)
);

CREATE TABLE pack_config_snapshot (
  snapshot_id  TEXT PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL,
  pack_id      TEXT NOT NULL,
  pack_version TEXT NOT NULL,
  config       JSONB NOT NULL,
  total_weight BIGINT NOT NULL,
  content_hash TEXT NOT NULL
);

-- One row per rip. Immutable: the price shown to the user is the one frozen in
-- the referenced snapshot, so this record stays true regardless of what the
-- market does afterwards.
CREATE TABLE pack_opening (
  opening_id                TEXT PRIMARY KEY,
  opened_at                 TIMESTAMPTZ NOT NULL,
  wallet                    TEXT NOT NULL,
  pack_id                   TEXT NOT NULL,
  pack_version              TEXT NOT NULL,
  price_snapshot_id         TEXT NOT NULL REFERENCES price_snapshot(snapshot_id),
  pack_config_snapshot_id   TEXT NOT NULL REFERENCES pack_config_snapshot(snapshot_id),
  server_seed_hash          TEXT NOT NULL,
  client_seed               TEXT NOT NULL,
  nonce                     BIGINT NOT NULL,
  -- NULL until the seed is rotated and revealed for public verification.
  server_seed               TEXT,
  UNIQUE (server_seed_hash, client_seed, nonce)
);

CREATE TABLE pack_opening_card (
  opening_id      TEXT NOT NULL REFERENCES pack_opening(opening_id) ON DELETE CASCADE,
  slot            SMALLINT NOT NULL,
  variant_id      TEXT NOT NULL REFERENCES pokemon_card_variant(variant_id),
  probability     DOUBLE PRECISION NOT NULL,
  reference_value NUMERIC(12,2) NOT NULL,
  tier            TEXT NOT NULL,
  PRIMARY KEY (opening_id, slot)
);

CREATE INDEX pack_opening_wallet_idx ON pack_opening (wallet, opened_at DESC);
CREATE INDEX pack_opening_card_variant_idx ON pack_opening_card (variant_id);

CREATE TABLE sync_state (
  key         TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ NOT NULL,
  last_cursor TEXT,
  note        TEXT
);

COMMIT;
