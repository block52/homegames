import { useEffect, useState } from "react";
import type { GameType } from "@homegames/core";
import type { SearchResultDTO, GameDetailDTO } from "../../shared/api";
import { shortFp, formatTime } from "../utils";
import { UnlockModal } from "../components/UnlockModal";

const GAME_TYPES: GameType[] = ["holdem", "omaha", "plo", "mixed", "other"];

function formatBuyIn(min?: number, max?: number): string {
    if (min === undefined && max === undefined) return "—";
    if (min !== undefined && max !== undefined) return `${min}–${max}`;
    if (min !== undefined) return `${min}+`;
    return `up to ${max}`;
}

export function GamesPage() {
    const [results, setResults] = useState<SearchResultDTO[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [showDetail, setShowDetail] = useState<string | null>(null);
    const [mineOnly, setMineOnly] = useState(false);

    const refresh = async () => {
        setLoading(true);
        const list = await window.homegames.games.list({ mine: mineOnly });
        setResults(list);
        setLoading(false);
    };

    useEffect(() => { refresh(); }, [mineOnly]);

    return (
        <div className="page">
            <h2>Games</h2>
            <p className="subtitle">Active home game listings. Private details only decrypt for trusted players.</p>

            <div className="toolbar">
                <button className="primary" onClick={() => setShowCreate(true)}>+ New listing</button>
                <button onClick={refresh}>Refresh</button>
                <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 0, textTransform: "none" }}>
                    <input
                        type="checkbox"
                        style={{ width: "auto" }}
                        checked={mineOnly}
                        onChange={(e) => setMineOnly(e.target.checked)}
                    />
                    My listings only
                </label>
                <div className="spacer" />
                <span style={{ color: "var(--text-dim)", fontSize: 12 }}>{results.length} active</span>
            </div>

            {loading ? (
                <div className="empty">Loading…</div>
            ) : results.length === 0 ? (
                <div className="empty">No games found. Click "+ New listing" to create one.</div>
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Stakes</th>
                            <th>Buy-in</th>
                            <th>Area</th>
                            <th>Day</th>
                            <th>Seats</th>
                            <th>Host</th>
                            <th>Expires</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.map(({ listing, publicData }) => (
                            <tr key={listing.listingId} className="clickable" onClick={() => setShowDetail(listing.listingId)}>
                                <td>{publicData.gameType}</td>
                                <td>{publicData.stakesRange}</td>
                                <td>{formatBuyIn(publicData.minBuyIn, publicData.maxBuyIn)}</td>
                                <td>{publicData.generalArea}</td>
                                <td>{publicData.dayOfWeek || "—"}</td>
                                <td>{publicData.seatsAvailable ?? "—"}</td>
                                <td className="mono">{shortFp(publicData.hostFingerprint)}</td>
                                <td style={{ color: "var(--text-dim)" }}>{formatTime(listing.expiresAt)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {showCreate && (
                <CreateGameModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); refresh(); }}
                />
            )}
            {showDetail && (
                <GameDetailModal
                    listingId={showDetail}
                    onClose={() => setShowDetail(null)}
                    onChanged={refresh}
                />
            )}
        </div>
    );
}

function defaultStartLocal(): string {
    // Default to next Friday 8pm in the user's local timezone, formatted for <input type="datetime-local">.
    const d = new Date();
    const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilFriday);
    d.setHours(20, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function CreateGameModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [needsUnlock, setNeedsUnlock] = useState(false);
    const [gameType, setGameType] = useState<GameType>("holdem");
    const [stakesRange, setStakesRange] = useState("");
    const [generalArea, setGeneralArea] = useState("");
    const [startLocal, setStartLocal] = useState(defaultStartLocal());
    const [seats, setSeats] = useState("9");
    const [minBuyIn, setMinBuyIn] = useState("");
    const [maxBuyIn, setMaxBuyIn] = useState("");
    const [location, setLocation] = useState("");
    const [contact, setContact] = useState("");
    const [rules, setRules] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const startDate = startLocal ? new Date(startLocal) : null;
    const validStart = !!startDate && !Number.isNaN(startDate.getTime());
    const dayOfWeek = validStart ? DAY_NAMES[startDate!.getDay()] : "";

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!validStart) return setError("Pick a start date and time.");
        if (startDate!.getTime() <= Date.now()) return setError("Start time must be in the future.");

        const status = await window.homegames.keyring.status();
        if (!status.unlocked) {
            setNeedsUnlock(true);
            return;
        }
        setBusy(true);
        try {
            const startTs = Math.floor(startDate!.getTime() / 1000);
            const expiresAt = startTs + 6 * 60 * 60; // listing drops 6h after start
            const exactTime = startDate!.toLocaleString();
            const hasPrivate = location || contact || rules;
            await window.homegames.games.create({
                publicData: {
                    gameType,
                    stakesRange,
                    generalArea,
                    dayOfWeek,
                    seatsAvailable: seats ? parseInt(seats, 10) : undefined,
                    minBuyIn: minBuyIn ? parseInt(minBuyIn, 10) : undefined,
                    maxBuyIn: maxBuyIn ? parseInt(maxBuyIn, 10) : undefined
                },
                privateData: hasPrivate ? {
                    location,
                    exactTime,
                    hostContact: contact,
                    houseRules: rules || undefined
                } : undefined,
                expiresAt
            });
            onCreated();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    if (needsUnlock) {
        return <UnlockModal onClose={() => setNeedsUnlock(false)} onUnlocked={() => setNeedsUnlock(false)} />;
    }

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>Create listing</h3>
                <form onSubmit={submit}>
                    <div className="field">
                        <label>Type</label>
                        <select value={gameType} onChange={(e) => setGameType(e.target.value as GameType)}>
                            {GAME_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div className="field">
                        <label>Stakes</label>
                        <input value={stakesRange} onChange={(e) => setStakesRange(e.target.value)} placeholder="e.g. 1/2" required />
                    </div>
                    <div className="field">
                        <label>General area</label>
                        <input value={generalArea} onChange={(e) => setGeneralArea(e.target.value)} placeholder="e.g. Downtown Melbourne" required />
                    </div>
                    <div className="field" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
                        <div>
                            <label>Start{dayOfWeek && ` · ${dayOfWeek}`}</label>
                            <input
                                type="datetime-local"
                                value={startLocal}
                                onChange={(e) => setStartLocal(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label>Seats</label>
                            <input value={seats} onChange={(e) => setSeats(e.target.value)} placeholder="9" />
                        </div>
                    </div>
                    <div className="field" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                            <label>Min buy-in</label>
                            <input value={minBuyIn} onChange={(e) => setMinBuyIn(e.target.value)} placeholder="100" />
                        </div>
                        <div>
                            <label>Max buy-in</label>
                            <input value={maxBuyIn} onChange={(e) => setMaxBuyIn(e.target.value)} placeholder="500" />
                        </div>
                    </div>

                    <div className="divider" />
                    <div style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 8 }}>
                        Private details (optional, encrypted to trusted players only). Exact start time is encrypted automatically.
                    </div>
                    <div className="field">
                        <label>Location</label>
                        <input value={location} onChange={(e) => setLocation(e.target.value)} />
                    </div>
                    <div className="field">
                        <label>Host contact</label>
                        <input value={contact} onChange={(e) => setContact(e.target.value)} />
                    </div>
                    <div className="field">
                        <label>House rules</label>
                        <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={2} />
                    </div>

                    {error && <div className="alert error">{error}</div>}

                    <div className="actions">
                        <button type="button" onClick={onClose}>Cancel</button>
                        <button type="submit" className="primary" disabled={busy}>
                            {busy ? "Creating…" : "Create"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function GameDetailModal({
    listingId,
    onClose,
    onChanged
}: { listingId: string; onClose: () => void; onChanged: () => void }) {
    const [detail, setDetail] = useState<GameDetailDTO | null | undefined>(undefined);
    const [needsUnlock, setNeedsUnlock] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        const d = await window.homegames.games.show(listingId);
        setDetail(d);
    };

    useEffect(() => { load(); }, [listingId]);

    const tryUnlock = async () => {
        const status = await window.homegames.keyring.status();
        if (!status.unlocked) {
            setNeedsUnlock(true);
        } else {
            load();
        }
    };

    const rsvp = async () => {
        const status = await window.homegames.keyring.status();
        if (!status.unlocked) { setNeedsUnlock(true); return; }
        setBusy(true);
        setError(null);
        try {
            await window.homegames.games.rsvp(listingId);
            await load();
        } catch (err) {
            setError((err as Error).message);
        } finally { setBusy(false); }
    };

    const cancel = async () => {
        if (!confirm("Cancel this listing?")) return;
        const status = await window.homegames.keyring.status();
        if (!status.unlocked) { setNeedsUnlock(true); return; }
        setBusy(true);
        try {
            await window.homegames.games.cancel(listingId);
            onChanged();
            onClose();
        } catch (err) {
            setError((err as Error).message);
        } finally { setBusy(false); }
    };

    if (needsUnlock) {
        return <UnlockModal onClose={() => setNeedsUnlock(false)} onUnlocked={() => { setNeedsUnlock(false); load(); }} />;
    }

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>Listing</h3>
                {detail === undefined ? (
                    <div>Loading…</div>
                ) : detail === null ? (
                    <div className="alert error">Listing not found.</div>
                ) : (
                    <>
                        <div className="card">
                            <div className="row"><div className="label">Type</div><div>{detail.publicData.gameType}</div></div>
                            <div className="row"><div className="label">Stakes</div><div>{detail.publicData.stakesRange}</div></div>
                            {(detail.publicData.minBuyIn !== undefined || detail.publicData.maxBuyIn !== undefined) && (
                                <div className="row"><div className="label">Buy-in</div><div>{formatBuyIn(detail.publicData.minBuyIn, detail.publicData.maxBuyIn)}</div></div>
                            )}
                            <div className="row"><div className="label">Area</div><div>{detail.publicData.generalArea}</div></div>
                            {detail.publicData.dayOfWeek && <div className="row"><div className="label">Day</div><div>{detail.publicData.dayOfWeek}</div></div>}
                            {detail.publicData.seatsAvailable !== undefined && <div className="row"><div className="label">Seats</div><div>{detail.publicData.seatsAvailable}</div></div>}
                            <div className="row"><div className="label">Host</div><div className="mono">{shortFp(detail.publicData.hostFingerprint)}</div></div>
                            <div className="row"><div className="label">Expires</div><div>{formatTime(detail.listing.expiresAt)}</div></div>
                        </div>

                        {detail.privateData ? (
                            <div className="card">
                                <div style={{ color: "var(--success)", fontSize: 12, marginBottom: 8 }}>✓ Private details (decrypted)</div>
                                <div className="row"><div className="label">Location</div><div>{detail.privateData.location}</div></div>
                                <div className="row"><div className="label">Time</div><div>{detail.privateData.exactTime}</div></div>
                                <div className="row"><div className="label">Contact</div><div>{detail.privateData.hostContact}</div></div>
                                {detail.privateData.houseRules && <div className="row"><div className="label">Rules</div><div>{detail.privateData.houseRules}</div></div>}
                            </div>
                        ) : detail.privateDataError ? (
                            <div className="alert warn">
                                {detail.privateDataError}
                                {!detail.isHost && <button style={{ marginLeft: 8 }} onClick={tryUnlock}>Unlock & retry</button>}
                            </div>
                        ) : null}

                        {detail.isHost && detail.rsvps.length > 0 && (
                            <div className="card">
                                <div className="label" style={{ marginBottom: 8 }}>RSVPs ({detail.rsvps.length})</div>
                                {detail.rsvps.map((r) => (
                                    <div key={r.id} className="row" style={{ marginTop: 4 }}>
                                        <div className="mono">{shortFp(r.playerFingerprint)}</div>
                                        <div><span className={`badge ${r.status === "accepted" ? "trusted" : r.status === "declined" ? "blocked" : "pending"}`}>{r.status}</span></div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {error && <div className="alert error">{error}</div>}

                        <div className="actions">
                            <button type="button" onClick={onClose}>Close</button>
                            {detail.isHost ? (
                                <button className="danger" onClick={cancel} disabled={busy}>Cancel listing</button>
                            ) : (
                                <button className="primary" onClick={rsvp} disabled={busy}>RSVP</button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
