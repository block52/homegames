import type Database from "better-sqlite3";

export const version = 2;

export function up(db: Database.Database): void {
    db.exec(`ALTER TABLE rsvps ADD COLUMN note TEXT;`);
}

export function down(db: Database.Database): void {
    db.exec(`ALTER TABLE rsvps DROP COLUMN note;`);
}
