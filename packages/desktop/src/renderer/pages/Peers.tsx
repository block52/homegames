import { useEffect, useState } from "react";
import type { Player } from "@homegames/core";
import { shortFp, formatTime } from "../utils";

export function PeersPage() {
    const [peers, setPeers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        setLoading(true);
        const list = await window.homegames.peers.list();
        setPeers(list);
        setLoading(false);
    };

    useEffect(() => { refresh(); }, []);

    return (
        <div className="page">
            <h2>Peers</h2>
            <p className="subtitle">Players whose public keys you've imported. Trust status is computed from vouches.</p>

            <div className="toolbar">
                <button onClick={refresh}>Refresh</button>
                <div className="spacer" />
                <span style={{ color: "var(--text-dim)", fontSize: 12 }}>{peers.length} known</span>
            </div>

            {loading ? (
                <div className="empty">Loading…</div>
            ) : peers.length === 0 ? (
                <div className="empty">
                    No peers known yet. Import a public key with the CLI: <span className="kbd">homegames identity import &lt;file&gt;</span>
                </div>
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th>Fingerprint</th>
                            <th>Nickname</th>
                            <th>Trust</th>
                            <th>I2P</th>
                            <th>Last Seen</th>
                        </tr>
                    </thead>
                    <tbody>
                        {peers.map((p) => (
                            <tr key={p.gpgFingerprint}>
                                <td className="mono">{shortFp(p.gpgFingerprint)}</td>
                                <td>{nickname(p) || <span style={{ color: "var(--text-dim)" }}>—</span>}</td>
                                <td><span className={`badge ${p.trustStatus}`}>{p.trustStatus}</span></td>
                                <td style={{ color: p.i2pDestination ? "var(--success)" : "var(--text-dim)" }}>
                                    {p.i2pDestination ? "yes" : "—"}
                                </td>
                                <td style={{ color: "var(--text-dim)" }}>{formatTime(p.lastSeen)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

function nickname(p: Player): string | null {
    if (!p.profileJson) return null;
    try {
        const profile = JSON.parse(p.profileJson) as { nickname?: string };
        return profile.nickname || null;
    } catch { return null; }
}
