import type Database from "better-sqlite3";
import { Player, TrustStatus } from "../../types/index.js";
import { timestampNow } from "../../crypto/utils.js";

interface PlayerRow {
    gpg_fingerprint: string;
    i2p_destination: string | null;
    public_key_armored: string;
    profile_json: string | null;
    trust_status: string;
    first_seen: number;
    last_seen: number;
}

function rowToPlayer(row: PlayerRow): Player {
    return {
        gpgFingerprint: row.gpg_fingerprint,
        i2pDestination: row.i2p_destination || undefined,
        publicKeyArmored: row.public_key_armored,
        profileJson: row.profile_json || undefined,
        trustStatus: row.trust_status as TrustStatus,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen
    };
}

export class PlayerRepository {
    constructor(private db: Database.Database) {}

    create(player: Omit<Player, "firstSeen" | "lastSeen"> & { firstSeen?: number; lastSeen?: number }): Player {
        const now = timestampNow();
        const stmt = this.db.prepare(`
            INSERT INTO players (gpg_fingerprint, i2p_destination, public_key_armored, profile_json, trust_status, first_seen, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const firstSeen = player.firstSeen ?? now;
        const lastSeen = player.lastSeen ?? now;

        stmt.run(
            player.gpgFingerprint,
            player.i2pDestination || null,
            player.publicKeyArmored,
            player.profileJson || null,
            player.trustStatus,
            firstSeen,
            lastSeen
        );

        return { ...player, firstSeen, lastSeen };
    }

    getByFingerprint(fingerprint: string): Player | null {
        const stmt = this.db.prepare("SELECT * FROM players WHERE gpg_fingerprint = ?");
        const row = stmt.get(fingerprint) as PlayerRow | undefined;
        return row ? rowToPlayer(row) : null;
    }

    getAll(): Player[] {
        const stmt = this.db.prepare("SELECT * FROM players ORDER BY last_seen DESC");
        const rows = stmt.all() as PlayerRow[];
        return rows.map(rowToPlayer);
    }

    getByTrustStatus(status: TrustStatus): Player[] {
        const stmt = this.db.prepare("SELECT * FROM players WHERE trust_status = ? ORDER BY last_seen DESC");
        const rows = stmt.all(status) as PlayerRow[];
        return rows.map(rowToPlayer);
    }

    updateTrustStatus(fingerprint: string, status: TrustStatus): void {
        const stmt = this.db.prepare("UPDATE players SET trust_status = ? WHERE gpg_fingerprint = ?");
        stmt.run(status, fingerprint);
    }

    updateLastSeen(fingerprint: string): void {
        const stmt = this.db.prepare("UPDATE players SET last_seen = ? WHERE gpg_fingerprint = ?");
        stmt.run(timestampNow(), fingerprint);
    }

    updateI2pDestination(fingerprint: string, destination: string): void {
        const stmt = this.db.prepare("UPDATE players SET i2p_destination = ?, last_seen = ? WHERE gpg_fingerprint = ?");
        stmt.run(destination, timestampNow(), fingerprint);
    }

    updateProfile(fingerprint: string, profileJson: string): void {
        const stmt = this.db.prepare("UPDATE players SET profile_json = ?, last_seen = ? WHERE gpg_fingerprint = ?");
        stmt.run(profileJson, timestampNow(), fingerprint);
    }

    delete(fingerprint: string): void {
        const stmt = this.db.prepare("DELETE FROM players WHERE gpg_fingerprint = ?");
        stmt.run(fingerprint);
    }

    exists(fingerprint: string): boolean {
        const stmt = this.db.prepare("SELECT 1 FROM players WHERE gpg_fingerprint = ?");
        return stmt.get(fingerprint) !== undefined;
    }

    count(): number {
        const stmt = this.db.prepare("SELECT COUNT(*) as count FROM players");
        const result = stmt.get() as { count: number };
        return result.count;
    }

    countByTrustStatus(status: TrustStatus): number {
        const stmt = this.db.prepare("SELECT COUNT(*) as count FROM players WHERE trust_status = ?");
        const result = stmt.get(status) as { count: number };
        return result.count;
    }
}
