import { useEffect, useState } from "react";
import type { NetworkStatusDTO } from "../../shared/api";
import { UnlockModal } from "./UnlockModal";

const POLL_MS = 3000;

const STATE_LABEL: Record<NetworkStatusDTO["state"], string> = {
    disconnected: "Offline",
    connecting: "Connecting…",
    connected: "Online",
    error: "Error"
};

const STATE_COLOR: Record<NetworkStatusDTO["state"], string> = {
    disconnected: "var(--text-dim)",
    connecting: "var(--warn)",
    connected: "var(--success)",
    error: "var(--danger)"
};

export function NetworkPanel() {
    const [status, setStatus] = useState<NetworkStatusDTO | null>(null);
    const [busy, setBusy] = useState(false);
    const [needsUnlock, setNeedsUnlock] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const refresh = async () => {
        try {
            const s = await window.homegames.network.status();
            setStatus(s);
        } catch { /* ignore */ }
    };

    useEffect(() => {
        refresh();
        const id = setInterval(refresh, POLL_MS);
        return () => clearInterval(id);
    }, []);

    const startAfterUnlock = async () => {
        setBusy(true);
        setActionError(null);
        try {
            const s = await window.homegames.network.start();
            setStatus(s);
        } catch (err) {
            setActionError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const start = async () => {
        const k = await window.homegames.keyring.status();
        if (!k.fingerprint) {
            setActionError("Create an identity first.");
            return;
        }
        if (!k.unlocked) {
            setNeedsUnlock(true);
            return;
        }
        await startAfterUnlock();
    };

    const stop = async () => {
        setBusy(true);
        setActionError(null);
        try {
            const s = await window.homegames.network.stop();
            setStatus(s);
        } catch (err) {
            setActionError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    if (!status) return null;

    const isOnline = status.state === "connected";
    const isStopping = busy && status.state === "connected";
    const isStarting = busy && status.state !== "connected";

    return (
        <>
            <div style={{ borderTop: "1px solid var(--border)", padding: "8px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                     onClick={() => setShowDetails(true)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                            width: 8, height: 8, borderRadius: 4,
                            background: STATE_COLOR[status.state],
                            display: "inline-block",
                            flexShrink: 0
                        }} />
                        <span style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Network</span>
                    </div>
                    <span style={{ fontSize: 11, color: STATE_COLOR[status.state] }}>
                        {STATE_LABEL[status.state]}
                        {isOnline && status.peerCount > 0 && ` · ${status.peerCount}`}
                    </span>
                </div>

                <div style={{ marginTop: 6 }}>
                    {!isOnline ? (
                        <button
                            onClick={start}
                            disabled={busy}
                            style={{ width: "100%", fontSize: 11, padding: "4px 8px" }}
                        >
                            {isStarting ? "Starting…" : "Start network"}
                        </button>
                    ) : (
                        <button
                            onClick={stop}
                            disabled={busy}
                            style={{ width: "100%", fontSize: 11, padding: "4px 8px" }}
                        >
                            {isStopping ? "Stopping…" : "Stop"}
                        </button>
                    )}
                </div>

                {(actionError || status.lastError) && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "var(--danger)" }}>
                        {actionError || status.lastError}
                    </div>
                )}
            </div>

            {needsUnlock && (
                <UnlockModal
                    onClose={() => setNeedsUnlock(false)}
                    onUnlocked={() => { setNeedsUnlock(false); startAfterUnlock(); }}
                />
            )}

            {showDetails && (
                <div className="modal-backdrop" onClick={() => setShowDetails(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h3>I2P Network</h3>
                        <div className="card">
                            <div className="row">
                                <div className="label">Status</div>
                                <div style={{ color: STATE_COLOR[status.state] }}>{STATE_LABEL[status.state]}</div>
                            </div>
                            <div className="row" style={{ marginTop: 4 }}>
                                <div className="label">Connected peers</div>
                                <div>{status.peerCount}</div>
                            </div>
                        </div>

                        {status.destinationBase32 && (
                            <div className="card">
                                <div className="label">Your I2P address</div>
                                <div className="mono" style={{ marginTop: 4, fontSize: 12 }}>
                                    {status.destinationBase32}
                                </div>
                                <button
                                    style={{ marginTop: 8 }}
                                    onClick={() => navigator.clipboard.writeText(status.destinationBase32!)}
                                >
                                    Copy address
                                </button>
                            </div>
                        )}

                        {!isOnline && (
                            <div className="alert info">
                                Networking requires <span className="kbd">i2pd</span> running locally with the SAM bridge enabled (port 7656).
                                On macOS: <span className="kbd">brew install i2pd</span> then <span className="kbd">i2pd</span> in a terminal. First boot takes a few minutes to reach the I2P network.
                            </div>
                        )}

                        {status.lastError && (
                            <div className="alert error">{status.lastError}</div>
                        )}

                        <div className="actions">
                            <button onClick={() => setShowDetails(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
