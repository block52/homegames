export type TrustLevel = 1 | 2 | 3;

export interface Vouch {
    id?: string;
    voucheeGpgFingerprint: string;
    voucheeI2pDestination?: string;
    voucherGpgFingerprint: string;
    timestamp: number;
    trustLevel: TrustLevel;
    noteEncrypted?: string;
    gpgSignature: string;
    revokedAt?: number;
}

export interface VouchCreateParams {
    voucheeFingerprint: string;
    voucheeI2pDestination?: string;
    trustLevel: TrustLevel;
    note?: string;
}

export interface VouchVerificationResult {
    valid: boolean;
    error?: string;
    vouch?: Vouch;
}

export interface TrustCalculationResult {
    status: "untrusted" | "pending" | "trusted";
    validVouchCount: number;
    requiredVouches: number;
    vouchesNeeded: number;
    validVouches: Vouch[];
    invalidReasons: Map<string, string>;
}

export const VOUCH_REQUIREMENTS = {
    MINIMUM_VOUCHES: 3,
    COOLING_PERIOD_DAYS: 30,
    MAX_VOUCHES_PER_MONTH: 10,
    MAX_CHAIN_DEPTH: 3
} as const;

export const TRUST_LEVEL_LABELS: Record<TrustLevel, string> = {
    1: "Met online",
    2: "Met in person",
    3: "Long-term trust"
};
