import type Database from "better-sqlite3";
import { Vouch, TrustLevel } from "../../types/index.js";
import { generateId, timestampNow } from "../../crypto/utils.js";

interface VouchRow {
    id: string;
    voucher_fingerprint: string;
    vouchee_fingerprint: string;
    trust_level: number;
    timestamp: number;
    signature: string;
    note_encrypted: string | null;
    revoked_at: number | null;
}

function rowToVouch(row: VouchRow): Vouch {
    return {
        id: row.id,
        voucherGpgFingerprint: row.voucher_fingerprint,
        voucheeGpgFingerprint: row.vouchee_fingerprint,
        trustLevel: row.trust_level as TrustLevel,
        timestamp: row.timestamp,
        gpgSignature: row.signature,
        noteEncrypted: row.note_encrypted || undefined,
        revokedAt: row.revoked_at || undefined
    };
}

export class VouchRepository {
    constructor(private db: Database.Database) {}

    create(vouch: Omit<Vouch, "id"> & { id?: string }): Vouch {
        const id = vouch.id || generateId();
        const stmt = this.db.prepare(`
            INSERT INTO vouches (id, voucher_fingerprint, vouchee_fingerprint, trust_level, timestamp, signature, note_encrypted, revoked_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            id,
            vouch.voucherGpgFingerprint,
            vouch.voucheeGpgFingerprint,
            vouch.trustLevel,
            vouch.timestamp,
            vouch.gpgSignature,
            vouch.noteEncrypted || null,
            vouch.revokedAt || null
        );

        return { ...vouch, id };
    }

    getById(id: string): Vouch | null {
        const stmt = this.db.prepare("SELECT * FROM vouches WHERE id = ?");
        const row = stmt.get(id) as VouchRow | undefined;
        return row ? rowToVouch(row) : null;
    }

    getVouchesFor(fingerprint: string, includeRevoked = false): Vouch[] {
        const sql = includeRevoked
            ? "SELECT * FROM vouches WHERE vouchee_fingerprint = ? ORDER BY timestamp DESC"
            : "SELECT * FROM vouches WHERE vouchee_fingerprint = ? AND revoked_at IS NULL ORDER BY timestamp DESC";
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(fingerprint) as VouchRow[];
        return rows.map(rowToVouch);
    }

    getVouchesBy(fingerprint: string, includeRevoked = false): Vouch[] {
        const sql = includeRevoked
            ? "SELECT * FROM vouches WHERE voucher_fingerprint = ? ORDER BY timestamp DESC"
            : "SELECT * FROM vouches WHERE voucher_fingerprint = ? AND revoked_at IS NULL ORDER BY timestamp DESC";
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(fingerprint) as VouchRow[];
        return rows.map(rowToVouch);
    }

    getVouchBetween(voucherFingerprint: string, voucheeFingerprint: string): Vouch | null {
        const stmt = this.db.prepare(
            "SELECT * FROM vouches WHERE voucher_fingerprint = ? AND vouchee_fingerprint = ?"
        );
        const row = stmt.get(voucherFingerprint, voucheeFingerprint) as VouchRow | undefined;
        return row ? rowToVouch(row) : null;
    }

    revoke(id: string): void {
        const stmt = this.db.prepare("UPDATE vouches SET revoked_at = ? WHERE id = ?");
        stmt.run(timestampNow(), id);
    }

    revokeByFingerprints(voucherFingerprint: string, voucheeFingerprint: string): void {
        const stmt = this.db.prepare(
            "UPDATE vouches SET revoked_at = ? WHERE voucher_fingerprint = ? AND vouchee_fingerprint = ? AND revoked_at IS NULL"
        );
        stmt.run(timestampNow(), voucherFingerprint, voucheeFingerprint);
    }

    countValidVouchesFor(fingerprint: string): number {
        const stmt = this.db.prepare(
            "SELECT COUNT(*) as count FROM vouches WHERE vouchee_fingerprint = ? AND revoked_at IS NULL"
        );
        const result = stmt.get(fingerprint) as { count: number };
        return result.count;
    }

    countVouchesGivenInPeriod(fingerprint: string, sinceTimestamp: number): number {
        const stmt = this.db.prepare(
            "SELECT COUNT(*) as count FROM vouches WHERE voucher_fingerprint = ? AND timestamp >= ?"
        );
        const result = stmt.get(fingerprint, sinceTimestamp) as { count: number };
        return result.count;
    }

    getAll(includeRevoked = false): Vouch[] {
        const sql = includeRevoked
            ? "SELECT * FROM vouches ORDER BY timestamp DESC"
            : "SELECT * FROM vouches WHERE revoked_at IS NULL ORDER BY timestamp DESC";
        const stmt = this.db.prepare(sql);
        const rows = stmt.all() as VouchRow[];
        return rows.map(rowToVouch);
    }

    delete(id: string): void {
        const stmt = this.db.prepare("DELETE FROM vouches WHERE id = ?");
        stmt.run(id);
    }
}
