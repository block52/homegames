import type Database from "better-sqlite3";

export class ConfigRepository {
    constructor(private db: Database.Database) {}

    get(key: string): string | null {
        const stmt = this.db.prepare("SELECT value FROM config WHERE key = ?");
        const row = stmt.get(key) as { value: string } | undefined;
        return row?.value ?? null;
    }

    set(key: string, value: string): void {
        const stmt = this.db.prepare(`
            INSERT INTO config (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `);
        stmt.run(key, value);
    }

    delete(key: string): void {
        const stmt = this.db.prepare("DELETE FROM config WHERE key = ?");
        stmt.run(key);
    }

    getAll(): Record<string, string> {
        const stmt = this.db.prepare("SELECT key, value FROM config");
        const rows = stmt.all() as { key: string; value: string }[];
        const result: Record<string, string> = {};
        for (const row of rows) {
            result[row.key] = row.value;
        }
        return result;
    }

    clear(): void {
        const stmt = this.db.prepare("DELETE FROM config");
        stmt.run();
    }
}

export class LocalIdentityRepository {
    constructor(private db: Database.Database) {}

    get(): { fingerprint: string; privateKeyEncrypted: string; publicKey: string; createdAt: number } | null {
        const stmt = this.db.prepare("SELECT * FROM local_identity WHERE id = 1");
        const row = stmt.get() as {
            gpg_fingerprint: string;
            private_key_armored_encrypted: string;
            public_key_armored: string;
            created_at: number;
        } | undefined;

        if (!row) return null;

        return {
            fingerprint: row.gpg_fingerprint,
            privateKeyEncrypted: row.private_key_armored_encrypted,
            publicKey: row.public_key_armored,
            createdAt: row.created_at
        };
    }

    set(fingerprint: string, privateKeyEncrypted: string, publicKey: string): void {
        const stmt = this.db.prepare(`
            INSERT INTO local_identity (id, gpg_fingerprint, private_key_armored_encrypted, public_key_armored, created_at)
            VALUES (1, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                gpg_fingerprint = excluded.gpg_fingerprint,
                private_key_armored_encrypted = excluded.private_key_armored_encrypted,
                public_key_armored = excluded.public_key_armored
        `);
        stmt.run(fingerprint, privateKeyEncrypted, publicKey, Math.floor(Date.now() / 1000));
    }

    exists(): boolean {
        const stmt = this.db.prepare("SELECT 1 FROM local_identity WHERE id = 1");
        return stmt.get() !== undefined;
    }

    delete(): void {
        const stmt = this.db.prepare("DELETE FROM local_identity WHERE id = 1");
        stmt.run();
    }
}
