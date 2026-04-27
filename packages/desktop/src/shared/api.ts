import type {
    Player,
    GameListing,
    GamePublicData,
    GamePrivateData,
    GameType,
    Vouch,
    TrustLevel,
    RSVPRequest,
    CheckIn,
    CheckInChallenge,
    CheckInResponse
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
    checkins: CheckIn[];
    myCheckIn?: CheckIn;
    isHost: boolean;
}

export interface CheckInRecordedDTO {
    checkin: CheckIn;
    playerNickname?: string;
}

export interface PeerDetailDTO {
    player: Player;
    trustStatus: "trusted" | "pending" | "untrusted" | "blocked";
    validVouchCount: number;
    requiredVouches: number;
    vouchesFor: Vouch[];
    myVouch: Vouch | null;
    isSelf: boolean;
}

export interface PeerImportPreview {
    fingerprint: string;
    publicKeyArmored: string;
    userIds: string[];
}

export interface PeerImportResult {
    player: Player;
    wasNew: boolean;
}

export interface KeyringStatus {
    unlocked: boolean;
    fingerprint: string | null;
}

export interface HomeGamesAPI {
    identity: {
        get: () => Promise<IdentitySummary | null>;
        create: (params: CreateIdentityParams) => Promise<IdentitySummary>;
        delete: () => Promise<void>;
    };
    keyring: {
        unlock: (passphrase: string) => Promise<boolean>;
        lock: () => Promise<void>;
        status: () => Promise<KeyringStatus>;
    };
    peers: {
        list: () => Promise<Player[]>;
        detail: (fingerprint: string) => Promise<PeerDetailDTO | null>;
        previewArmored: (armored: string) => Promise<PeerImportPreview>;
        import: (armored: string) => Promise<PeerImportResult>;
        fetchByFingerprint: (fingerprint: string) => Promise<string>;
    };
    vouches: {
        listMine: () => Promise<Vouch[]>;
        create: (
            voucheeFingerprint: string,
            trustLevel: TrustLevel,
            note?: string
        ) => Promise<Vouch>;
        revoke: (voucheeFingerprint: string) => Promise<void>;
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
    checkins: {
        createChallenge: (gameListingId: string) => Promise<CheckInChallenge>;
        signChallenge: (challenge: CheckInChallenge) => Promise<CheckInResponse>;
        verifyAndRecord: (
            challenge: CheckInChallenge,
            response: CheckInResponse
        ) => Promise<CheckInRecordedDTO>;
        listForGame: (gameListingId: string) => Promise<CheckIn[]>;
    };
}

declare global {
    interface Window {
        homegames: HomeGamesAPI;
    }
}
