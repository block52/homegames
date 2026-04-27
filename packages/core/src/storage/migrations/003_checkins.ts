import type Database from "better-sqlite3";

export const version = 3;

export function up(db: Database.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS checkins (
            id TEXT PRIMARY KEY,
            game_listing_id TEXT NOT NULL,
            player_fingerprint TEXT NOT NULL,
            host_fingerprint TEXT NOT NULL,
            nonce TEXT NOT NULL,
            challenge_timestamp INTEGER NOT NULL,
            player_signature TEXT NOT NULL,
            recorded_at INTEGER NOT NULL,
            FOREIGN KEY (game_listing_id) REFERENCES games(listing_id),
            FOREIGN KEY (player_fingerprint) REFERENCES players(gpg_fingerprint),
            FOREIGN KEY (host_fingerprint) REFERENCES players(gpg_fingerprint),
            UNIQUE(game_listing_id, player_fingerprint)
        );
        CREATE INDEX IF NOT EXISTS idx_checkins_game ON checkins(game_listing_id);
    `);
}

export function down(db: Database.Database): void {
    db.exec(`
        DROP INDEX IF EXISTS idx_checkins_game;
        DROP TABLE IF EXISTS checkins;
    `);
}
