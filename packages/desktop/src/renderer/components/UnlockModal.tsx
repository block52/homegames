import { useState } from "react";

interface Props {
    onClose: () => void;
    onUnlocked: () => void;
}

export function UnlockModal({ onClose, onUnlocked }: Props) {
    const [passphrase, setPassphrase] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const ok = await window.homegames.keyring.unlock(passphrase);
        setBusy(false);
        if (!ok) {
            setError("Invalid passphrase.");
            return;
        }
        onUnlocked();
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>Unlock identity</h3>
                <form onSubmit={submit}>
                    <div className="field">
                        <label>Passphrase</label>
                        <input
                            type="password"
                            autoFocus
                            value={passphrase}
                            onChange={(e) => setPassphrase(e.target.value)}
                        />
                    </div>
                    {error && <div className="alert error">{error}</div>}
                    <div className="actions">
                        <button type="button" onClick={onClose}>Cancel</button>
                        <button type="submit" className="primary" disabled={busy || !passphrase}>
                            {busy ? "Unlocking..." : "Unlock"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
