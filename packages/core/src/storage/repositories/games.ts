import type Database from "better-sqlite3";
import { GameListing } from "../../types/index.js";
import { timestampNow } from "../../crypto/utils.js";

interface GameRow {
    listing_id: string;
    host_fingerprint: string;
    public_data_json: string;
    encrypted_data_blob: string | null;
    signature: string;
    created_at: number;
    expires_at: number;
}

function rowToGame(row: GameRow): GameListing {
    return {
        listingId: row.listing_id,
        hostFingerprint: row.host_fingerprint,
        publicDataJson: row.public_data_json,
        encryptedDataBlob: row.encrypted_data_blob || undefined,
        signature: row.signature,
        createdAt: row.created_at,
        expiresAt: row.expires_at
    };
}

export class GameRepository {
    constructor(private db: Database.Database) {}

    upsert(game: GameListing): GameListing {
        const stmt = this.db.prepare(`
            INSERT INTO games (listing_id, host_fingerprint, public_data_json, encrypted_data_blob, signature, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(listing_id) DO UPDATE SET
                public_data_json = excluded.public_data_json,
                encrypted_data_blob = excluded.encrypted_data_blob,
                signature = excluded.signature,
                expires_at = excluded.expires_at
        `);

        stmt.run(
            game.listingId,
            game.hostFingerprint,
            game.publicDataJson,
            game.encryptedDataBlob || null,
            game.signature,
            game.createdAt,
            game.expiresAt
        );

        return game;
    }

    getById(listingId: string): GameListing | null {
        const stmt = this.db.prepare("SELECT * FROM games WHERE listing_id = ?");
        const row = stmt.get(listingId) as GameRow | undefined;
        return row ? rowToGame(row) : null;
    }

    getByHost(hostFingerprint: string, includeExpired = false): GameListing[] {
        const sql = includeExpired
            ? "SELECT * FROM games WHERE host_fingerprint = ? ORDER BY created_at DESC"
            : "SELECT * FROM games WHERE host_fingerprint = ? AND expires_at > ? ORDER BY created_at DESC";
        const stmt = this.db.prepare(sql);
        const rows = (includeExpired
            ? stmt.all(hostFingerprint)
            : stmt.all(hostFingerprint, timestampNow())) as GameRow[];
        return rows.map(rowToGame);
    }

    getActive(): GameListing[] {
        const stmt = this.db.prepare(
            "SELECT * FROM games WHERE expires_at > ? ORDER BY created_at DESC"
        );
        const rows = stmt.all(timestampNow()) as GameRow[];
        return rows.map(rowToGame);
    }

    getAll(): GameListing[] {
        const stmt = this.db.prepare("SELECT * FROM games ORDER BY created_at DESC");
        const rows = stmt.all() as GameRow[];
        return rows.map(rowToGame);
    }

    delete(listingId: string): void {
        const stmt = this.db.prepare("DELETE FROM games WHERE listing_id = ?");
        stmt.run(listingId);
    }

    deleteExpired(): number {
        const stmt = this.db.prepare("DELETE FROM games WHERE expires_at <= ?");
        const result = stmt.run(timestampNow());
        return result.changes;
    }
}
