import type Database from "better-sqlite3";
import { CheckIn } from "../../types/index.js";

interface CheckInRow {
    id: string;
    game_listing_id: string;
    player_fingerprint: string;
    host_fingerprint: string;
    nonce: string;
    challenge_timestamp: number;
    player_signature: string;
    recorded_at: number;
}

function rowToCheckIn(row: CheckInRow): CheckIn {
    return {
        id: row.id,
        gameListingId: row.game_listing_id,
        playerFingerprint: row.player_fingerprint,
        hostFingerprint: row.host_fingerprint,
        nonce: row.nonce,
        challengeTimestamp: row.challenge_timestamp,
        playerSignature: row.player_signature,
        recordedAt: row.recorded_at
    };
}

export class CheckInRepository {
    constructor(private db: Database.Database) {}

    create(checkin: CheckIn): CheckIn {
        const stmt = this.db.prepare(`
            INSERT INTO checkins (id, game_listing_id, player_fingerprint, host_fingerprint, nonce, challenge_timestamp, player_signature, recorded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            checkin.id,
            checkin.gameListingId,
            checkin.playerFingerprint,
            checkin.hostFingerprint,
            checkin.nonce,
            checkin.challengeTimestamp,
            checkin.playerSignature,
            checkin.recordedAt
        );
        return checkin;
    }

    getByGame(gameListingId: string): CheckIn[] {
        const stmt = this.db.prepare(
            "SELECT * FROM checkins WHERE game_listing_id = ? ORDER BY recorded_at ASC"
        );
        const rows = stmt.all(gameListingId) as CheckInRow[];
        return rows.map(rowToCheckIn);
    }

    findExisting(gameListingId: string, playerFingerprint: string): CheckIn | null {
        const stmt = this.db.prepare(
            "SELECT * FROM checkins WHERE game_listing_id = ? AND player_fingerprint = ?"
        );
        const row = stmt.get(gameListingId, playerFingerprint) as CheckInRow | undefined;
        return row ? rowToCheckIn(row) : null;
    }

    getByPlayer(playerFingerprint: string): CheckIn[] {
        const stmt = this.db.prepare(
            "SELECT * FROM checkins WHERE player_fingerprint = ? ORDER BY recorded_at DESC"
        );
        const rows = stmt.all(playerFingerprint) as CheckInRow[];
        return rows.map(rowToCheckIn);
    }
}
