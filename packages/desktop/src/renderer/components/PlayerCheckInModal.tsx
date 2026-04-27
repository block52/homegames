import { useEffect, useState } from "react";
import type { CheckInChallenge, CheckInResponse } from "@homegames/core";
import { QRCanvas } from "./QRCanvas";
import { QRScanner } from "./QRScanner";
import { UnlockModal } from "./UnlockModal";

interface Props {
    onClose: () => void;
}

export function PlayerCheckInModal({ onClose }: Props) {
    const [needsUnlock, setNeedsUnlock] = useState(false);
    const [response, setResponse] = useState<CheckInResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        window.homegames.keyring.status().then((s) => {
            if (!s.unlocked) setNeedsUnlock(true);
        });
    }, []);

    const handleScan = async (text: string) => {
        setError(null);
        let challenge: CheckInChallenge;
        try {
            challenge = JSON.parse(text);
        } catch {
            setError("Scanned QR isn't a check-in challenge.");
            return;
        }
        try {
            const resp = await window.homegames.checkins.signChallenge(challenge);
            setResponse(resp);
        } catch (err) {
            setError((err as Error).message);
        }
    };

    if (needsUnlock) {
        return <UnlockModal onClose={onClose} onUnlocked={() => setNeedsUnlock(false)} />;
    }

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
                <h3>Check in to game</h3>

                {error && <div className="alert error">{error}</div>}

                {!response ? (
                    <>
                        <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: -8 }}>
                            Scan the QR shown by your host.
                        </p>
                        <QRScanner
                            onDecoded={handleScan}
                            onError={(err) => setError((err as Error).message || "Camera error")}
                        />
                    </>
                ) : (
                    <>
                        <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: -8 }}>
                            Show this QR back to your host so they can record you as checked in.
                        </p>
                        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 16px" }}>
                            <QRCanvas payload={JSON.stringify(response)} size={260} />
                        </div>
                        <div className="alert info">
                            ✓ Signed. The host scans this back to confirm.
                        </div>
                    </>
                )}

                <div className="actions">
                    <button onClick={onClose}>{response ? "Done" : "Cancel"}</button>
                </div>
            </div>
        </div>
    );
}
