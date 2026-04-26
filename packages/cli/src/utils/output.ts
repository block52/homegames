import chalk from "chalk";

export function success(message: string): void {
    console.log(chalk.green("✓ " + message));
}

export function error(message: string): void {
    console.log(chalk.red("✗ " + message));
}

export function warn(message: string): void {
    console.log(chalk.yellow("⚠ " + message));
}

export function info(message: string): void {
    console.log(chalk.blue("ℹ " + message));
}

export function heading(message: string): void {
    console.log(chalk.bold.underline(message));
}

export function dim(message: string): void {
    console.log(chalk.dim(message));
}

export function formatFingerprint(fingerprint: string): string {
    const upper = fingerprint.toUpperCase();
    const chunks: string[] = [];
    for (let i = 0; i < upper.length; i += 4) {
        chunks.push(upper.slice(i, i + 4));
    }
    return chunks.join(" ");
}

export function shortenFingerprint(fingerprint: string): string {
    return fingerprint.slice(-16).toUpperCase();
}

export function formatTimestamp(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
}

export function formatTrustLevel(level: number): string {
    switch (level) {
        case 1:
            return chalk.yellow("Met online");
        case 2:
            return chalk.blue("Met in person");
        case 3:
            return chalk.green("Long-term trust");
        default:
            return chalk.gray("Unknown");
    }
}

export function formatTrustStatus(status: string): string {
    switch (status) {
        case "trusted":
            return chalk.green("Trusted");
        case "pending":
            return chalk.yellow("Pending (needs more vouches)");
        case "untrusted":
            return chalk.gray("Untrusted");
        case "blocked":
            return chalk.red("Blocked");
        default:
            return chalk.gray(status);
    }
}

export function table(headers: string[], rows: string[][]): void {
    const colWidths = headers.map((h, i) => {
        const maxData = Math.max(...rows.map(r => (r[i] || "").length));
        return Math.max(h.length, maxData);
    });

    const separator = colWidths.map(w => "-".repeat(w + 2)).join("+");
    const formatRow = (row: string[]) =>
        row.map((cell, i) => ` ${(cell || "").padEnd(colWidths[i])} `).join("|");

    console.log(separator);
    console.log(formatRow(headers));
    console.log(separator);
    for (const row of rows) {
        console.log(formatRow(row));
    }
    console.log(separator);
}
