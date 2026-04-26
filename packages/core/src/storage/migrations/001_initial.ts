import type Database from "better-sqlite3";

export const version = 1;

export function up(db: Database.Database): void {
    db.exec(`
        -- Players table
        CREATE TABLE IF NOT EXISTS players (
            gpg_fingerprint TEXT PRIMARY KEY,
            i2p_destination TEXT,
            public_key_armored TEXT NOT NULL,
            profile_json TEXT,
            trust_status TEXT DEFAULT 'untrusted'
                CHECK(trust_status IN ('untrusted', 'pending', 'trusted', 'blocked')),
            first_seen INTEGER NOT NULL,
            last_seen INTEGER NOT NULL
        );

        -- Vouches table
        CREATE TABLE IF NOT EXISTS vouches (
            id TEXT PRIMARY KEY,
            voucher_fingerprint TEXT NOT NULL,
            vouchee_fingerprint TEXT NOT NULL,
            trust_level INTEGER NOT NULL CHECK(trust_level IN (1, 2, 3)),
            timestamp INTEGER NOT NULL,
            signature TEXT NOT NULL,
            note_encrypted TEXT,
            revoked_at INTEGER,
            FOREIGN KEY (voucher_fingerprint) REFERENCES players(gpg_fingerprint),
            FOREIGN KEY (vouchee_fingerprint) REFERENCES players(gpg_fingerprint),
            UNIQUE(voucher_fingerprint, vouchee_fingerprint)
        );

        -- Games table (for Phase 2)
        CREATE TABLE IF NOT EXISTS games (
            listing_id TEXT PRIMARY KEY,
            host_fingerprint TEXT NOT NULL,
            public_data_json TEXT,
            encrypted_data_blob TEXT,
            signature TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            FOREIGN KEY (host_fingerprint) REFERENCES players(gpg_fingerprint)
        );

        -- RSVPs table (for Phase 2)
        CREATE TABLE IF NOT EXISTS rsvps (
            id TEXT PRIMARY KEY,
            game_listing_id TEXT NOT NULL,
            player_fingerprint TEXT NOT NULL,
            status TEXT DEFAULT 'pending'
                CHECK(status IN ('pending', 'accepted', 'declined')),
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (game_listing_id) REFERENCES games(listing_id),
            FOREIGN KEY (player_fingerprint) REFERENCES players(gpg_fingerprint)
        );

        -- Messages table (for Phase 2)
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            from_fingerprint TEXT NOT NULL,
            to_fingerprint TEXT NOT NULL,
            encrypted_content TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            read_at INTEGER,
            FOREIGN KEY (from_fingerprint) REFERENCES players(gpg_fingerprint),
            FOREIGN KEY (to_fingerprint) REFERENCES players(gpg_fingerprint)
        );

        -- Local identity storage (single row)
        CREATE TABLE IF NOT EXISTS local_identity (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            gpg_fingerprint TEXT NOT NULL,
            private_key_armored_encrypted TEXT NOT NULL,
            public_key_armored TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );

        -- Configuration storage
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- Indexes for performance
        CREATE INDEX IF NOT EXISTS idx_vouches_vouchee ON vouches(vouchee_fingerprint);
        CREATE INDEX IF NOT EXISTS idx_vouches_voucher ON vouches(voucher_fingerprint);
        CREATE INDEX IF NOT EXISTS idx_vouches_not_revoked ON vouches(vouchee_fingerprint) WHERE revoked_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_players_trust_status ON players(trust_status);
        CREATE INDEX IF NOT EXISTS idx_games_host ON games(host_fingerprint);
        CREATE INDEX IF NOT EXISTS idx_games_expires ON games(expires_at);
        CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_fingerprint);
        CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(to_fingerprint) WHERE read_at IS NULL;
    `);
}

export function down(db: Database.Database): void {
    db.exec(`
        DROP INDEX IF EXISTS idx_messages_unread;
        DROP INDEX IF EXISTS idx_messages_to;
        DROP INDEX IF EXISTS idx_games_expires;
        DROP INDEX IF EXISTS idx_games_host;
        DROP INDEX IF EXISTS idx_players_trust_status;
        DROP INDEX IF EXISTS idx_vouches_not_revoked;
        DROP INDEX IF EXISTS idx_vouches_voucher;
        DROP INDEX IF EXISTS idx_vouches_vouchee;
        DROP TABLE IF EXISTS config;
        DROP TABLE IF EXISTS local_identity;
        DROP TABLE IF EXISTS messages;
        DROP TABLE IF EXISTS rsvps;
        DROP TABLE IF EXISTS games;
        DROP TABLE IF EXISTS vouches;
        DROP TABLE IF EXISTS players;
    `);
}
