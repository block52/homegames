export interface PlayerProfile {
    gpgFingerprint: string;
    i2pDestination?: string;
    nickname?: string;
    preferredStakes?: string[];
    gameTypes?: string[];
    generalLocation?: string;
    createdAt: number;
    profileSignature: string;
}

export interface Identity {
    gpgFingerprint: string;
    publicKeyArmored: string;
    privateKeyArmored?: string;
    profile?: PlayerProfile;
}

export interface IdentityOptions {
    name?: string;
    email?: string;
    passphrase: string;
    keyType?: "rsa" | "ecc";
    rsaBits?: 4096;
    curve?: "ed25519" | "curve25519";
}

export type TrustStatus = "untrusted" | "pending" | "trusted" | "blocked";

export interface Player {
    gpgFingerprint: string;
    i2pDestination?: string;
    publicKeyArmored: string;
    profileJson?: string;
    trustStatus: TrustStatus;
    firstSeen: number;
    lastSeen: number;
}

export interface LocalIdentity {
    gpgFingerprint: string;
    privateKeyArmoredEncrypted: string;
    createdAt: number;
}
