import { useState } from "react";
import type { TrustLevel } from "@homegames/core";
import { shortFp } from "../utils";

interface Props {
    playerFingerprint: string;
    playerNickname?: string;
    onClose: () => void;
    onVouched: () => void;
}

export function VouchPromptModal({ playerFingerprint, playerNickname, onClose, onVouched }: Props) {
    const [level, setLevel] = useState<TrustLevel>(2);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            await window.homegames.vouches.create(playerFingerprint, level, note.trim() || undefined);
            onVouched();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>Vouch for this player?</h3>
                <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: -8 }}>
                    You just met <strong>{playerNickname || shortFp(playerFingerprint)}</strong> in person. A vouch helps the trust graph grow — they'll need 3 to see private game details.
                </p>

                <div className="field">
                    <label>Trust level</label>
                    <select value={level} onChange={(e) => setLevel(Number(e.target.value) as TrustLevel)}>
                        <option value={1}>1 — Met online</option>
                        <option value={2}>2 — Met in person (suggested)</option>
                        <option value={3}>3 — Long-term trust</option>
                    </select>
                </div>

                <div className="field">
                    <label>Note (optional)</label>
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. checked in at Friday night home game" />
                </div>

                {error && <div className="alert error">{error}</div>}

                <div className="actions">
                    <button onClick={onClose}>Skip</button>
                    <button className="primary" onClick={submit} disabled={busy}>
                        {busy ? "Vouching…" : "Create vouch"}
                    </button>
                </div>
            </div>
        </div>
    );
}
