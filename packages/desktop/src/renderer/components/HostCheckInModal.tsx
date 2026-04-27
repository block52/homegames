import { useEffect, useState } from "react";
import type { CheckInChallenge, CheckInResponse, CheckIn } from "@homegames/core";
import type { CheckInRecordedDTO } from "../../shared/api";
import { QRCanvas } from "./QRCanvas";
import { QRScanner } from "./QRScanner";
import { UnlockModal } from "./UnlockModal";
import { shortFp, formatTime } from "../utils";

interface Props {
    listingId: string;
    onClose: () => void;
    onCheckedIn: (recorded: CheckInRecordedDTO) => void;
}

const REFRESH_MS = 30_000;

export function HostCheckInModal({ listingId, onClose, onCheckedIn }: Props) {
    const [challenge, setChallenge] = useState<CheckInChallenge | null>(null);
    const [needsUnlock, setNeedsUnlock] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recent, setRecent] = useState<CheckIn[]>([]);

    const refreshChallenge = async () => {
        setError(null);
        try {
            const c = await window.homegames.checkins.createChallenge(listingId);
            setChallenge(c);
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const refreshList = async () => {
        const list = await window.homegames.checkins.listForGame(listingId);
        setRecent(list);
    };

    useEffect(() => {
        const status = window.homegames.keyring.status();
        status.then((s) => {
            if (!s.unlocked) { setNeedsUnlock(true); return; }
            refreshChallenge();
            refreshList();
        });
    }, []);

    useEffect(() => {
        if (!challenge) return;
        const id = setInterval(refreshChallenge, REFRESH_MS);
        return () => clearInterval(id);
    }, [challenge?.n]);

    const handleScan = async (text: string) => {
        if (!challenge) return;
        setError(null);
        let response: CheckInResponse;
        try {
            response = JSON.parse(text);
        } catch {
            setError("Scanned QR isn't a check-in response.");
            return;
        }
        try {
            const recorded = await window.homegames.checkins.verifyAndRecord(challenge, response);
            setScanning(false);
            await refreshList();
            await refreshChallenge();
            onCheckedIn(recorded);
        } catch (err) {
            setError((err as Error).message);
        }
    };

    if (needsUnlock) {
        return <UnlockModal onClose={onClose} onUnlocked={() => { setNeedsUnlock(false); refreshChallenge(); refreshList(); }} />;
    }

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
                <h3>Check players in</h3>
                <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: -8 }}>
                    Show this QR to a player who's just arrived. They'll scan it, sign with their key, then show you their response QR to scan back.
                </p>

                {error && <div className="alert error">{error}</div>}

                {!scanning ? (
                    <>
                        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 16px" }}>
                            {challenge ? <QRCanvas payload={JSON.stringify(challenge)} size={260} /> : <div style={{ height: 260 }}>Generating…</div>}
                        </div>
                        <div className="actions" style={{ justifyContent: "space-between" }}>
                            <button onClick={refreshChallenge}>Refresh QR</button>
                            <button className="primary" onClick={() => setScanning(true)}>Scan player's response →</button>
                        </div>
                    </>
                ) : (
                    <>
                        <QRScanner
                            onDecoded={handleScan}
                            onError={(err) => setError((err as Error).message || "Camera error")}
                        />
                        <div className="actions">
                            <button onClick={() => setScanning(false)}>← Back to QR</button>
                        </div>
                    </>
                )}

                {recent.length > 0 && (
                    <div className="card" style={{ marginTop: 16 }}>
                        <div className="label" style={{ marginBottom: 8 }}>Checked in ({recent.length})</div>
                        {recent.map((c) => (
                            <div key={c.id} className="row" style={{ marginTop: 4 }}>
                                <div className="mono">{shortFp(c.playerFingerprint)}</div>
                                <div style={{ color: "var(--text-dim)", fontSize: 12 }}>{formatTime(c.recordedAt)}</div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="actions" style={{ marginTop: 12 }}>
                    <button onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}
