import { useState } from "react";
import type { PeerImportPreview } from "../../shared/api";
import { QRScanner } from "./QRScanner";
import { formatFp } from "../utils";

type Tab = "paste" | "keyserver" | "qr";

interface Props {
    onClose: () => void;
    onAdded: (wasNew: boolean) => void;
}

export function AddPeerModal({ onClose, onAdded }: Props) {
    const [tab, setTab] = useState<Tab>("paste");
    const [armored, setArmored] = useState("");
    const [fingerprint, setFingerprint] = useState("");
    const [preview, setPreview] = useState<PeerImportPreview | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = () => {
        setArmored("");
        setFingerprint("");
        setPreview(null);
        setError(null);
    };

    const tryPreview = async (block: string) => {
        setBusy(true);
        setError(null);
        try {
            const p = await window.homegames.peers.previewArmored(block);
            setPreview(p);
        } catch (err) {
            setError("Couldn't parse that block. Make sure it starts with -----BEGIN PGP PUBLIC KEY BLOCK-----.");
            console.error(err);
        } finally {
            setBusy(false);
        }
    };

    const fetchAndPreview = async () => {
        setBusy(true);
        setError(null);
        try {
            const block = await window.homegames.peers.fetchByFingerprint(fingerprint);
            setArmored(block);
            await tryPreview(block);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const handleQrScan = async (text: string) => {
        // QR can carry either an armored block or a bare fingerprint.
        if (text.includes("BEGIN PGP PUBLIC KEY BLOCK")) {
            setArmored(text);
            await tryPreview(text);
            return;
        }
        const stripped = text.replace(/\s+/g, "").toUpperCase();
        if (/^[A-F0-9]{40}$/.test(stripped)) {
            setFingerprint(stripped);
            setBusy(true);
            try {
                const block = await window.homegames.peers.fetchByFingerprint(stripped);
                setArmored(block);
                await tryPreview(block);
            } catch (err) {
                setError((err as Error).message);
            } finally {
                setBusy(false);
            }
            return;
        }
        setError("QR doesn't look like a public key or fingerprint.");
    };

    const confirmAdd = async () => {
        if (!armored) return;
        setBusy(true);
        setError(null);
        try {
            const result = await window.homegames.peers.import(armored);
            onAdded(result.wasNew);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
                <h3>Add peer</h3>

                {!preview ? (
                    <>
                        <div className="toolbar" style={{ marginBottom: 16 }}>
                            <button className={tab === "paste" ? "primary" : ""} onClick={() => { setTab("paste"); reset(); }}>Paste</button>
                            <button className={tab === "keyserver" ? "primary" : ""} onClick={() => { setTab("keyserver"); reset(); }}>Keyserver</button>
                            <button className={tab === "qr" ? "primary" : ""} onClick={() => { setTab("qr"); reset(); }}>QR</button>
                        </div>

                        {tab === "paste" && (
                            <>
                                <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: -8 }}>
                                    Paste a public key block someone sent you (WhatsApp, Signal, email…).
                                </p>
                                <textarea
                                    value={armored}
                                    onChange={(e) => setArmored(e.target.value)}
                                    rows={10}
                                    placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----&#10;…&#10;-----END PGP PUBLIC KEY BLOCK-----"
                                    style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}
                                />
                                <div className="actions">
                                    <button onClick={onClose}>Cancel</button>
                                    <button className="primary" disabled={busy || !armored.trim()} onClick={() => tryPreview(armored)}>
                                        {busy ? "Parsing…" : "Preview"}
                                    </button>
                                </div>
                            </>
                        )}

                        {tab === "keyserver" && (
                            <>
                                <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: -8 }}>
                                    Look up by GPG fingerprint on keys.openpgp.org. Only finds keys whose owner verified an email.
                                </p>
                                <input
                                    value={fingerprint}
                                    onChange={(e) => setFingerprint(e.target.value)}
                                    placeholder="ABCD 1234 5678 …  (40 hex chars, spaces ok)"
                                    style={{ fontFamily: "ui-monospace, monospace" }}
                                />
                                <div className="actions">
                                    <button onClick={onClose}>Cancel</button>
                                    <button className="primary" disabled={busy || !fingerprint.trim()} onClick={fetchAndPreview}>
                                        {busy ? "Fetching…" : "Look up"}
                                    </button>
                                </div>
                            </>
                        )}

                        {tab === "qr" && (
                            <>
                                <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: -8 }}>
                                    Scan a QR containing either an armored public key or a fingerprint hex.
                                </p>
                                <QRScanner
                                    onDecoded={handleQrScan}
                                    onError={(err) => setError((err as Error).message || "Camera error")}
                                />
                                <div className="actions">
                                    <button onClick={onClose}>Cancel</button>
                                </div>
                            </>
                        )}

                        {error && <div className="alert error">{error}</div>}
                    </>
                ) : (
                    <>
                        <div className="card">
                            <div className="label">Fingerprint</div>
                            <div className="mono" style={{ marginTop: 4 }}>{formatFp(preview.fingerprint)}</div>
                        </div>
                        {preview.userIds.length > 0 && (
                            <div className="card">
                                <div className="label">User IDs</div>
                                {preview.userIds.map((uid, i) => (
                                    <div key={i} style={{ marginTop: 4, fontSize: 13 }}>{uid}</div>
                                ))}
                            </div>
                        )}

                        {error && <div className="alert error">{error}</div>}

                        <div className="actions">
                            <button onClick={() => { setPreview(null); }}>Back</button>
                            <button className="primary" disabled={busy} onClick={confirmAdd}>
                                {busy ? "Adding…" : "Add peer"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
