import { useEffect, useState } from "react";
import type { Player } from "@homegames/core";
import { shortFp, formatTime } from "../utils";
import { PeerDetailModal } from "../components/PeerDetailModal";
import { AddPeerModal } from "../components/AddPeerModal";

export function PeersPage() {
    const [peers, setPeers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<string | null>(null);
    const [showAdd, setShowAdd] = useState(false);
    const [flash, setFlash] = useState<string | null>(null);

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
                <button className="primary" onClick={() => setShowAdd(true)}>+ Add peer</button>
                <button onClick={refresh}>Refresh</button>
                <div className="spacer" />
                <span style={{ color: "var(--text-dim)", fontSize: 12 }}>{peers.length} known</span>
            </div>

            {flash && <div className="alert info">{flash}</div>}

            {loading ? (
                <div className="empty">Loading…</div>
            ) : peers.length === 0 ? (
                <div className="empty">
                    No peers known yet. Click "+ Add peer" to import one by paste, keyserver lookup, or QR.
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
                            <tr key={p.gpgFingerprint}
                                className="clickable"
                                onClick={() => setSelected(p.gpgFingerprint)}>
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

            {selected && (
                <PeerDetailModal
                    fingerprint={selected}
                    onClose={() => setSelected(null)}
                    onChanged={refresh}
                />
            )}

            {showAdd && (
                <AddPeerModal
                    onClose={() => setShowAdd(false)}
                    onAdded={(wasNew) => {
                        setShowAdd(false);
                        setFlash(wasNew ? "Peer added." : "Peer already in your list — last seen updated.");
                        refresh();
                        setTimeout(() => setFlash(null), 4000);
                    }}
                />
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
