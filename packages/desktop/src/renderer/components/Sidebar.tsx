import { useEffect, useState } from "react";
import { shortFp } from "../utils";
import type { KeyringStatus } from "../../shared/api";

export type Page = "identity" | "peers" | "games";

interface Props {
    page: Page;
    onNavigate: (page: Page) => void;
}

export function Sidebar({ page, onNavigate }: Props) {
    const [status, setStatus] = useState<KeyringStatus>({ unlocked: false, fingerprint: null });

    const refresh = async () => {
        const s = await window.homegames.keyring.status();
        setStatus(s);
    };

    useEffect(() => {
        refresh();
        const id = setInterval(refresh, 5000);
        return () => clearInterval(id);
    }, []);

    const lock = async () => {
        await window.homegames.keyring.lock();
        refresh();
    };

    return (
        <aside className="sidebar">
            <h1>HomeGames</h1>
            <nav>
                <button className={`nav-item ${page === "games" ? "active" : ""}`} onClick={() => onNavigate("games")}>Games</button>
                <button className={`nav-item ${page === "peers" ? "active" : ""}`} onClick={() => onNavigate("peers")}>Peers</button>
                <button className={`nav-item ${page === "identity" ? "active" : ""}`} onClick={() => onNavigate("identity")}>Identity</button>
            </nav>
            <div className="footer">
                {status.fingerprint ? (
                    <>
                        <div className="label">You</div>
                        <div className="fp">{shortFp(status.fingerprint)}</div>
                        <div style={{ marginTop: 4, color: status.unlocked ? "var(--success)" : "var(--text-dim)" }}>
                            {status.unlocked ? "Unlocked" : "Locked"}
                        </div>
                        {status.unlocked && <button onClick={lock}>Lock</button>}
                    </>
                ) : (
                    <div>No identity</div>
                )}
            </div>
        </aside>
    );
}
