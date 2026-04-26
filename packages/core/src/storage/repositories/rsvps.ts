import type Database from "better-sqlite3";
import { RSVPRequest } from "../../types/index.js";
import { generateId } from "../../crypto/utils.js";

type RSVPStatus = RSVPRequest["status"];

interface RSVPRow {
    id: string;
    game_listing_id: string;
    player_fingerprint: string;
    status: RSVPStatus;
    timestamp: number;
}

function rowToRSVP(row: RSVPRow): RSVPRequest {
    return {
        id: row.id,
        gameListingId: row.game_listing_id,
        playerFingerprint: row.player_fingerprint,
        status: row.status,
        timestamp: row.timestamp
    };
}

export class RSVPRepository {
    constructor(private db: Database.Database) {}

    create(rsvp: Omit<RSVPRequest, "id"> & { id?: string }): RSVPRequest {
        const id = rsvp.id || generateId();
        const stmt = this.db.prepare(`
            INSERT INTO rsvps (id, game_listing_id, player_fingerprint, status, timestamp)
            VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run(id, rsvp.gameListingId, rsvp.playerFingerprint, rsvp.status, rsvp.timestamp);

        return { ...rsvp, id };
    }

    getById(id: string): RSVPRequest | null {
        const stmt = this.db.prepare("SELECT * FROM rsvps WHERE id = ?");
        const row = stmt.get(id) as RSVPRow | undefined;
        return row ? rowToRSVP(row) : null;
    }

    getByGame(gameListingId: string): RSVPRequest[] {
        const stmt = this.db.prepare(
            "SELECT * FROM rsvps WHERE game_listing_id = ? ORDER BY timestamp ASC"
        );
        const rows = stmt.all(gameListingId) as RSVPRow[];
        return rows.map(rowToRSVP);
    }

    getByPlayer(playerFingerprint: string): RSVPRequest[] {
        const stmt = this.db.prepare(
            "SELECT * FROM rsvps WHERE player_fingerprint = ? ORDER BY timestamp DESC"
        );
        const rows = stmt.all(playerFingerprint) as RSVPRow[];
        return rows.map(rowToRSVP);
    }

    findExisting(gameListingId: string, playerFingerprint: string): RSVPRequest | null {
        const stmt = this.db.prepare(
            "SELECT * FROM rsvps WHERE game_listing_id = ? AND player_fingerprint = ?"
        );
        const row = stmt.get(gameListingId, playerFingerprint) as RSVPRow | undefined;
        return row ? rowToRSVP(row) : null;
    }

    updateStatus(id: string, status: RSVPStatus): void {
        const stmt = this.db.prepare("UPDATE rsvps SET status = ? WHERE id = ?");
        stmt.run(status, id);
    }

    delete(id: string): void {
        const stmt = this.db.prepare("DELETE FROM rsvps WHERE id = ?");
        stmt.run(id);
    }

    deleteByGame(gameListingId: string): number {
        const stmt = this.db.prepare("DELETE FROM rsvps WHERE game_listing_id = ?");
        const result = stmt.run(gameListingId);
        return result.changes;
    }

    getPendingByPlayer(playerFingerprint: string): RSVPRequest[] {
        const stmt = this.db.prepare(
            "SELECT * FROM rsvps WHERE player_fingerprint = ? AND status = 'pending' ORDER BY timestamp ASC"
        );
        const rows = stmt.all(playerFingerprint) as RSVPRow[];
        return rows.map(rowToRSVP);
    }
}
