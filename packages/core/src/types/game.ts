export type GameType = "holdem" | "omaha" | "plo" | "mixed" | "other";

export interface GamePublicData {
    gameType: GameType;
    stakesRange: string;
    generalArea: string;
    dayOfWeek?: string;
    seatsAvailable?: number;
    hostFingerprint: string;
    minimumTrustLevel?: number;
}

export interface GamePrivateData {
    location: string;
    exactTime: string;
    hostContact: string;
    houseRules?: string;
}

export interface GameListing {
    listingId: string;
    hostFingerprint: string;
    publicDataJson: string;
    encryptedDataBlob?: string;
    signature: string;
    createdAt: number;
    expiresAt: number;
}

export interface RSVPRequest {
    id: string;
    gameListingId: string;
    playerFingerprint: string;
    status: "pending" | "accepted" | "declined";
    timestamp: number;
}

export interface GameFilters {
    gameType?: GameType;
    stakesRange?: string;
    generalArea?: string;
    dayOfWeek?: string;
    minSeats?: number;
}
