import { useState } from "react";
import { Sidebar, type Page } from "./components/Sidebar";
import { IdentityPage } from "./pages/Identity";
import { PeersPage } from "./pages/Peers";
import { GamesPage } from "./pages/Games";

export function App() {
    const [page, setPage] = useState<Page>("identity");

    return (
        <div className="app">
            <Sidebar page={page} onNavigate={setPage} />
            <main>
                {page === "identity" && <IdentityPage />}
                {page === "peers" && <PeersPage />}
                {page === "games" && <GamesPage />}
            </main>
        </div>
    );
}
