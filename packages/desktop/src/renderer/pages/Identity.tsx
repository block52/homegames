import { useEffect, useState } from "react";
import type { IdentitySummary } from "../../shared/api";
import { formatFp, formatTime } from "../utils";

export function IdentityPage() {
    const [identity, setIdentity] = useState<IdentitySummary | null | undefined>(undefined);

    const refresh = async () => {
        const id = await window.homegames.identity.get();
        setIdentity(id);
    };

    useEffect(() => { refresh(); }, []);

    if (identity === undefined) return <div className="page">Loading…</div>;

    if (identity === null) return <CreateIdentity onCreated={refresh} />;

    return (
        <div className="page">
            <h2>Your Identity</h2>
            <p className="subtitle">Your GPG keypair is your identity on the HomeGames network.</p>

            <div className="card">
                <div className="row"><div className="label">Fingerprint</div></div>
                <div className="mono" style={{ marginTop: 4 }}>{formatFp(identity.fingerprint)}</div>
            </div>

            <div className="card">
                <div className="label">Created</div>
                <div style={{ marginTop: 4 }}>{formatTime(identity.createdAt)}</div>
            </div>

            <div className="card">
                <div className="label">Public key</div>
                <pre style={{ marginTop: 8 }}>{identity.publicKeyArmored}</pre>
                <button
                    style={{ marginTop: 8 }}
                    onClick={() => navigator.clipboard.writeText(identity.publicKeyArmored)}
                >
                    Copy public key
                </button>
            </div>
        </div>
    );
}

function CreateIdentity({ onCreated }: { onCreated: () => void }) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [passphrase, setPassphrase] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (passphrase.length < 8) return setError("Passphrase must be at least 8 characters.");
        if (passphrase !== confirm) return setError("Passphrases don't match.");
        setBusy(true);
        try {
            await window.homegames.identity.create({
                name: name || undefined,
                email: email || undefined,
                passphrase
            });
            onCreated();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="page">
            <h2>Create identity</h2>
            <p className="subtitle">Generate a new GPG keypair. Your passphrase encrypts the private key on disk and cannot be recovered.</p>

            <form onSubmit={submit} style={{ maxWidth: 480 }}>
                <div className="card">
                    <div style={{ marginBottom: 12 }}>
                        <label>Display name (optional)</label>
                        <input value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <label>Email (optional)</label>
                        <input value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <label>Passphrase</label>
                        <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <label>Confirm passphrase</label>
                        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                    </div>
                    {error && <div className="alert error">{error}</div>}
                    <button type="submit" className="primary" disabled={busy}>
                        {busy ? "Generating…" : "Create identity"}
                    </button>
                </div>
            </form>
        </div>
    );
}
