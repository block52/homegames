import type {
    Player,
    GameListing,
    GamePublicData,
    GamePrivateData,
    GameType,
    Vouch,
    TrustLevel,
    RSVPRequest
} from "@homegames/core";

export interface IdentitySummary {
    fingerprint: string;
    publicKeyArmored: string;
    createdAt: number;
}

export interface CreateIdentityParams {
    name?: string;
    email?: string;
    passphrase: string;
}

export interface CreateGameParams {
    publicData: Omit<GamePublicData, "hostFingerprint">;
    privateData?: GamePrivateData;
    expiresAt: number;
}

export interface SearchResultDTO {
    listing: GameListing;
    publicData: GamePublicData;
}

export interface GameDetailDTO {
    listing: GameListing;
    publicData: GamePublicData;
    privateData?: GamePrivateData;
    privateDataError?: string;
    rsvps: RSVPRequest[];
    isHost: boolean;
}

export interface KeyringStatus {
    unlocked: boolean;
    fingerprint: string | null;
}

export interface HomeGamesAPI {
    identity: {
        get: () => Promise<IdentitySummary | null>;
        create: (params: CreateIdentityParams) => Promise<IdentitySummary>;
    };
    keyring: {
        unlock: (passphrase: string) => Promise<boolean>;
        lock: () => Promise<void>;
        status: () => Promise<KeyringStatus>;
    };
    peers: {
        list: () => Promise<Player[]>;
    };
    vouches: {
        listMine: () => Promise<Vouch[]>;
        create: (
            voucheeFingerprint: string,
            trustLevel: TrustLevel,
            note?: string
        ) => Promise<Vouch>;
    };
    games: {
        list: (filters?: {
            gameType?: GameType;
            stakesRange?: string;
            generalArea?: string;
            mine?: boolean;
        }) => Promise<SearchResultDTO[]>;
        create: (params: CreateGameParams) => Promise<GameListing>;
        show: (listingId: string) => Promise<GameDetailDTO | null>;
        rsvp: (listingId: string, note?: string) => Promise<RSVPRequest>;
        cancel: (listingId: string) => Promise<void>;
    };
}

declare global {
    interface Window {
        homegames: HomeGamesAPI;
    }
}
