import type Database from "better-sqlite3";
import * as migration001 from "./001_initial.js";

interface Migration {
    version: number;
    up: (db: Database.Database) => void;
    down: (db: Database.Database) => void;
}

const migrations: Migration[] = [
    migration001
];

export function runMigrations(db: Database.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
        );
    `);

    const rows = db.prepare("SELECT version FROM _migrations").all() as { version: number }[];
    const appliedVersions = new Set(rows.map(row => row.version));

    for (const migration of migrations) {
        if (!appliedVersions.has(migration.version)) {
            db.transaction(() => {
                migration.up(db);
                db.prepare("INSERT INTO _migrations (version, applied_at) VALUES (?, ?)").run(
                    migration.version,
                    Math.floor(Date.now() / 1000)
                );
            })();
            console.log(`Applied migration ${migration.version}`);
        }
    }
}

export function rollbackMigration(db: Database.Database, toVersion: number): void {
    const appliedVersions = db
        .prepare("SELECT version FROM _migrations ORDER BY version DESC")
        .all() as { version: number }[];

    for (const { version } of appliedVersions) {
        if (version > toVersion) {
            const migration = migrations.find(m => m.version === version);
            if (migration) {
                db.transaction(() => {
                    migration.down(db);
                    db.prepare("DELETE FROM _migrations WHERE version = ?").run(version);
                })();
                console.log(`Rolled back migration ${version}`);
            }
        }
    }
}

export function getCurrentVersion(db: Database.Database): number {
    try {
        const result = db.prepare("SELECT MAX(version) as version FROM _migrations").get() as { version: number | null };
        return result?.version ?? 0;
    } catch {
        return 0;
    }
}
