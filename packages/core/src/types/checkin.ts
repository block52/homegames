export interface CheckIn {
    id: string;
    gameListingId: string;
    playerFingerprint: string;
    hostFingerprint: string;
    nonce: string;
    challengeTimestamp: number;
    playerSignature: string;
    recordedAt: number;
}

/** Payload encoded into the host's QR code for player to scan. */
export interface CheckInChallenge {
    v: 1;
    k: "challenge";
    g: string;     // gameListingId
    h: string;     // hostFingerprint
    n: string;     // nonce (hex)
    t: number;     // challenge timestamp (unix seconds)
}

/** Payload encoded into the player's QR code for host to scan back. */
export interface CheckInResponse {
    v: 1;
    k: "response";
    g: string;     // gameListingId
    p: string;     // playerFingerprint
    h: string;     // hostFingerprint (echoed)
    n: string;     // nonce (hex)
    t: number;     // challenge timestamp
    s: string;     // detached GPG signature
}
