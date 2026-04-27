import { useEffect, useState } from "react";
import type { PeerDetailDTO } from "../../shared/api";
import { formatFp, shortFp, formatTime } from "../utils";
import { UnlockModal } from "./UnlockModal";
import { VouchPromptModal } from "./VouchPromptModal";

interface Props {
    fingerprint: string;
    onClose: () => void;
    onChanged: () => void;
}

export function PeerDetailModal({ fingerprint, onClose, onChanged }: Props) {
    const [detail, setDetail] = useState<PeerDetailDTO | null | undefined>(undefined);
    const [needsUnlock, setNeedsUnlock] = useState<"vouch" | "revoke" | null>(null);
    const [showVouchModal, setShowVouchModal] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        const d = await window.homegames.peers.detail(fingerprint);
        setDetail(d);
    };

    useEffect(() => { load(); }, [fingerprint]);

    const startVouch = async () => {
        setError(null);
        const status = await window.homegames.keyring.status();
        if (!status.unlocked) {
            setNeedsUnlock("vouch");
            return;
        }
        setShowVouchModal(true);
    };

    const startRevoke = async () => {
        setError(null);
        if (!confirm("Revoke your vouch for this player? This is broadcast to peers.")) return;
        const status = await window.homegames.keyring.status();
        if (!status.unlocked) {
            setNeedsUnlock("revoke");
            return;
        }
        await doRevoke();
    };

    const doRevoke = async () => {
        setBusy(true);
        try {
            await window.homegames.vouches.revoke(fingerprint);
            await load();
            onChanged();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const onUnlocked = () => {
        const intent = needsUnlock;
        setNeedsUnlock(null);
        if (intent === "vouch") setShowVouchModal(true);
        if (intent === "revoke") doRevoke();
    };

    if (needsUnlock) {
        return <UnlockModal onClose={() => setNeedsUnlock(null)} onUnlocked={onUnlocked} />;
    }

    if (showVouchModal && detail) {
        return (
            <VouchPromptModal
                playerFingerprint={fingerprint}
                playerNickname={nickname(detail)}
                onClose={() => setShowVouchModal(false)}
                onVouched={() => {
                    setShowVouchModal(false);
                    load();
                    onChanged();
                }}
            />
        );
    }

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
                <h3>Peer details</h3>

                {detail === undefined && <div>Loading…</div>}
                {detail === null && <div className="alert error">Peer not found.</div>}
                {detail && (
                    <>
                        <div className="card">
                            {nickname(detail) && (
                                <div className="row" style={{ marginBottom: 8 }}>
                                    <div className="label">Nickname</div>
                                    <div>{nickname(detail)}</div>
                                </div>
                            )}
                            <div className="label">Fingerprint</div>
                            <div className="mono" style={{ marginTop: 4 }}>{formatFp(detail.player.gpgFingerprint)}</div>
                        </div>

                        <div className="card">
                            <div className="row">
                                <div>
                                    <div className="label">Trust status</div>
                                    <div style={{ marginTop: 4 }}>
                                        <span className={`badge ${detail.trustStatus}`}>{detail.trustStatus}</span>
                                    </div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div className="label">Vouches received</div>
                                    <div style={{ marginTop: 4 }}>
                                        <strong>{detail.validVouchCount}</strong>
                                        <span style={{ color: "var(--text-dim)" }}> / {detail.requiredVouches}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {detail.isSelf ? (
                            <div className="alert info">This is you. You can't vouch for yourself.</div>
                        ) : detail.myVouch ? (
                            <div className="card">
                                <div className="label">Your vouch</div>
                                <div style={{ marginTop: 4, fontSize: 13 }}>
                                    Level {detail.myVouch.trustLevel} · {formatTime(detail.myVouch.timestamp)}
                                </div>
                                {detail.myVouch.noteEncrypted && (
                                    <div style={{ marginTop: 4, color: "var(--text-dim)", fontSize: 12, fontStyle: "italic" }}>
                                        "{detail.myVouch.noteEncrypted}"
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="alert info">You haven't vouched for this player yet.</div>
                        )}

                        {detail.vouchesFor.length > 0 && (
                            <div className="card">
                                <div className="label" style={{ marginBottom: 8 }}>
                                    All vouches received ({detail.vouchesFor.length})
                                </div>
                                {detail.vouchesFor.map((v) => (
                                    <div key={v.id || `${v.voucherGpgFingerprint}-${v.timestamp}`}
                                         className="row" style={{ marginTop: 4 }}>
                                        <div className="mono">{shortFp(v.voucherGpgFingerprint)}</div>
                                        <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
                                            L{v.trustLevel} · {formatTime(v.timestamp)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {error && <div className="alert error">{error}</div>}

                        <div className="actions">
                            <button onClick={onClose}>Close</button>
                            {!detail.isSelf && (
                                detail.myVouch ? (
                                    <button className="danger" onClick={startRevoke} disabled={busy}>
                                        {busy ? "Revoking…" : "Revoke vouch"}
                                    </button>
                                ) : (
                                    <button className="primary" onClick={startVouch}>
                                        Vouch for player
                                    </button>
                                )
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function nickname(detail: PeerDetailDTO): string | undefined {
    if (!detail.player.profileJson) return undefined;
    try {
        return (JSON.parse(detail.player.profileJson) as { nickname?: string }).nickname;
    } catch { return undefined; }
}
