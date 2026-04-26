import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";
import { runMigrations } from "./migrations/index.js";

export interface DatabaseOptions {
    dbPath?: string;
    inMemory?: boolean;
    verbose?: boolean;
}

export class HomeGamesDatabase {
    private db: Database.Database;
    private readonly dbPath: string;

    constructor(options: DatabaseOptions = {}) {
        if (options.inMemory) {
            this.dbPath = ":memory:";
        } else {
            this.dbPath = options.dbPath || this.getDefaultPath();
            this.ensureDirectory();
        }

        this.db = new Database(this.dbPath, {
            verbose: options.verbose ? console.log : undefined
        });

        this.db.pragma("journal_mode = WAL");
        this.db.pragma("foreign_keys = ON");

        runMigrations(this.db);
    }

    private getDefaultPath(): string {
        const homeDir = os.homedir();
        return path.join(homeDir, ".homegames", "homegames.db");
    }

    private ensureDirectory(): void {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    getConnection(): Database.Database {
        return this.db;
    }

    getPath(): string {
        return this.dbPath;
    }

    close(): void {
        this.db.close();
    }

    backup(destPath: string): void {
        this.db.backup(destPath);
    }
}

let defaultInstance: HomeGamesDatabase | null = null;

export function getDatabase(options?: DatabaseOptions): HomeGamesDatabase {
    if (!defaultInstance) {
        defaultInstance = new HomeGamesDatabase(options);
    }
    return defaultInstance;
}

export function closeDatabase(): void {
    if (defaultInstance) {
        defaultInstance.close();
        defaultInstance = null;
    }
}
