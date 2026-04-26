export function shortFp(fp: string): string {
    return fp.slice(-16).toUpperCase();
}

export function formatFp(fp: string): string {
    const upper = fp.toUpperCase();
    const chunks: string[] = [];
    for (let i = 0; i < upper.length; i += 4) chunks.push(upper.slice(i, i + 4));
    return chunks.join(" ");
}

export function formatTime(ts: number): string {
    return new Date(ts * 1000).toLocaleString();
}
