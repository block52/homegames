import { useEffect, useState } from "react";
import type { IdentitySummary } from "../../shared/api";
import { formatFp, formatTime } from "../utils";
import { QRCanvas } from "../components/QRCanvas";

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
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => navigator.clipboard.writeText(identity.publicKeyArmored)}>
                        Copy public key
                    </button>
                    <ShowAsQRButton armored={identity.publicKeyArmored} />
                </div>
            </div>

            <DangerZone onDeleted={refresh} />
        </div>
    );
}

function ShowAsQRButton({ armored }: { armored: string }) {
    const [open, setOpen] = useState(false);
    // Ed25519 public keys armored fit comfortably in a single QR (~700 chars).
    // RSA 4096 keys are ~3000 chars and overflow QR capacity — surface that
    // explicitly so the user knows to fall back to copy-paste.
    const tooBig = armored.length > 1800;

    return (
        <>
            <button onClick={() => setOpen(true)}>Show as QR</button>
            {open && (
                <div className="modal-backdrop" onClick={() => setOpen(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h3>Your public key as QR</h3>
                        {tooBig ? (
                            <div className="alert warn">
                                This key is too large to fit in a single QR. Use 'Copy public key' and paste it instead.
                            </div>
                        ) : (
                            <>
                                <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: -8 }}>
                                    Have your peer scan this from their HomeGames → Peers → Add peer → QR.
                                </p>
                                <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 16px" }}>
                                    <QRCanvas payload={armored} size={300} />
                                </div>
                            </>
                        )}
                        <div className="actions">
                            <button onClick={() => setOpen(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function DangerZone({ onDeleted }: { onDeleted: () => void }) {
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);

    const remove = async () => {
        setBusy(true);
        try {
            await window.homegames.identity.delete();
            setConfirming(false);
            onDeleted();
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <div className="card" style={{ borderColor: "var(--danger)" }}>
                <div className="label" style={{ color: "var(--danger)" }}>Danger zone</div>
                <p style={{ color: "var(--text-dim)", fontSize: 13, margin: "8px 0 12px" }}>
                    Deleting your identity removes the local private key. Vouches you've made and games you've hosted stay in the database but become unsigned-by-anyone-here. There is no recovery.
                </p>
                <button className="danger" onClick={() => setConfirming(true)}>Delete identity</button>
            </div>

            {confirming && (
                <div className="modal-backdrop" onClick={() => !busy && setConfirming(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h3>Delete identity?</h3>
                        <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
                            Your encrypted private key will be removed from <span className="kbd">~/.homegames/homegames.db</span>. If you don't have the passphrase + an exported backup elsewhere, this is permanent.
                        </p>
                        <div className="actions">
                            <button onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
                            <button className="danger" onClick={remove} disabled={busy}>
                                {busy ? "Deleting…" : "Yes, delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
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
