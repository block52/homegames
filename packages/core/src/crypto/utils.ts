import { randomBytes } from "crypto";

export function generateId(): string {
    return randomBytes(16).toString("hex");
}

export function formatFingerprint(fingerprint: string): string {
    const upper = fingerprint.toUpperCase();
    const chunks: string[] = [];
    for (let i = 0; i < upper.length; i += 4) {
        chunks.push(upper.slice(i, i + 4));
    }
    return chunks.join(" ");
}

export function normalizeFingerprint(fingerprint: string): string {
    return fingerprint.replace(/\s+/g, "").toUpperCase();
}

export function shortenFingerprint(fingerprint: string): string {
    const normalized = normalizeFingerprint(fingerprint);
    return normalized.slice(-16);
}

export function validateFingerprint(fingerprint: string): boolean {
    const normalized = normalizeFingerprint(fingerprint);
    return /^[A-F0-9]{40}$/.test(normalized);
}

export function timestampNow(): number {
    return Math.floor(Date.now() / 1000);
}

export function isExpired(expiresAt: number): boolean {
    return timestampNow() > expiresAt;
}

export function addDays(timestamp: number, days: number): number {
    return timestamp + days * 24 * 60 * 60;
}
