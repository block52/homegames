import * as openpgp from "openpgp";
import { Vouch, TrustCalculationResult, VOUCH_REQUIREMENTS, TrustStatus } from "../types/index.js";
import { VouchRepository } from "../storage/repositories/vouches.js";
import { PlayerRepository } from "../storage/repositories/players.js";
import { verifySignedObject } from "../crypto/index.js";

export class TrustEngine {
    private trustCache: Map<string, { status: TrustStatus; timestamp: number }> = new Map();
    private readonly cacheTtlMs = 60000; // 1 minute cache

    constructor(
        private vouchRepo: VouchRepository,
        private playerRepo: PlayerRepository
    ) {}

    async calculateTrust(fingerprint: string, depth = 0): Promise<TrustCalculationResult> {
        // Check cache first
        const cached = this.trustCache.get(fingerprint);
        if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
            return {
                status: cached.status === "trusted" ? "trusted" : "untrusted",
                validVouchCount: cached.status === "trusted" ? VOUCH_REQUIREMENTS.MINIMUM_VOUCHES : 0,
                requiredVouches: VOUCH_REQUIREMENTS.MINIMUM_VOUCHES,
                vouchesNeeded: cached.status === "trusted" ? 0 : VOUCH_REQUIREMENTS.MINIMUM_VOUCHES,
                validVouches: [],
                invalidReasons: new Map()
            };
        }

        // Prevent infinite recursion
        if (depth > VOUCH_REQUIREMENTS.MAX_CHAIN_DEPTH) {
            return {
                status: "untrusted",
                validVouchCount: 0,
                requiredVouches: VOUCH_REQUIREMENTS.MINIMUM_VOUCHES,
                vouchesNeeded: VOUCH_REQUIREMENTS.MINIMUM_VOUCHES,
                validVouches: [],
                invalidReasons: new Map([["depth", "Maximum trust chain depth exceeded"]])
            };
        }

        // Check if player is blocked
        const player = this.playerRepo.getByFingerprint(fingerprint);
        if (player?.trustStatus === "blocked") {
            return {
                status: "untrusted",
                validVouchCount: 0,
                requiredVouches: VOUCH_REQUIREMENTS.MINIMUM_VOUCHES,
                vouchesNeeded: VOUCH_REQUIREMENTS.MINIMUM_VOUCHES,
                validVouches: [],
                invalidReasons: new Map([["blocked", "Player is blocked"]])
            };
        }

        const vouches = this.vouchRepo.getVouchesFor(fingerprint, false);
        const validVouches: Vouch[] = [];
        const invalidReasons = new Map<string, string>();

        for (const vouch of vouches) {
            const vouchId = vouch.id || `${vouch.voucherGpgFingerprint}-${vouch.timestamp}`;

            // Skip revoked vouches (already filtered, but double-check)
            if (vouch.revokedAt) {
                invalidReasons.set(vouchId, "Vouch has been revoked");
                continue;
            }

            // Verify the voucher exists and is not blocked
            const voucher = this.playerRepo.getByFingerprint(vouch.voucherGpgFingerprint);
            if (!voucher) {
                invalidReasons.set(vouchId, "Voucher not found in registry");
                continue;
            }

            if (voucher.trustStatus === "blocked") {
                invalidReasons.set(vouchId, "Voucher is blocked");
                continue;
            }

            // Verify voucher is trusted (recursive check)
            const voucherTrusted = await this.isVoucherTrusted(vouch.voucherGpgFingerprint, depth + 1);
            if (!voucherTrusted) {
                invalidReasons.set(vouchId, "Voucher is not trusted");
                continue;
            }

            // Verify signature
            const signatureValid = await this.verifyVouchSignature(vouch, voucher.publicKeyArmored);
            if (!signatureValid) {
                invalidReasons.set(vouchId, "Invalid signature");
                continue;
            }

            validVouches.push(vouch);
        }

        const vouchesNeeded = Math.max(0, VOUCH_REQUIREMENTS.MINIMUM_VOUCHES - validVouches.length);
        const status = validVouches.length >= VOUCH_REQUIREMENTS.MINIMUM_VOUCHES ? "trusted" : "untrusted";

        // Update cache
        this.trustCache.set(fingerprint, { status, timestamp: Date.now() });

        // Update player trust status in database
        // Note: blocked players already returned early, so we can safely update here
        if (player) {
            const newStatus = status === "trusted" ? "trusted" : (validVouches.length > 0 ? "pending" : "untrusted");
            if (player.trustStatus !== newStatus) {
                this.playerRepo.updateTrustStatus(fingerprint, newStatus);
            }
        }

        return {
            status: status === "trusted" ? "trusted" : (validVouches.length > 0 ? "pending" : "untrusted"),
            validVouchCount: validVouches.length,
            requiredVouches: VOUCH_REQUIREMENTS.MINIMUM_VOUCHES,
            vouchesNeeded,
            validVouches,
            invalidReasons
        };
    }

    private async isVoucherTrusted(fingerprint: string, depth: number): Promise<boolean> {
        // Check cache
        const cached = this.trustCache.get(fingerprint);
        if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
            return cached.status === "trusted";
        }

        // Check if explicitly marked as trusted in database
        const player = this.playerRepo.getByFingerprint(fingerprint);
        if (!player) return false;
        if (player.trustStatus === "blocked") return false;
        if (player.trustStatus === "trusted") {
            this.trustCache.set(fingerprint, { status: "trusted", timestamp: Date.now() });
            return true;
        }

        // Recursive trust calculation
        const result = await this.calculateTrust(fingerprint, depth);
        return result.status === "trusted";
    }

    private async verifyVouchSignature(vouch: Vouch, publicKeyArmored: string): Promise<boolean> {
        try {
            const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });

            // Reconstruct the payload
            const payload: Record<string, unknown> = {
                voucheeGpgFingerprint: vouch.voucheeGpgFingerprint,
                voucherGpgFingerprint: vouch.voucherGpgFingerprint,
                timestamp: vouch.timestamp,
                trustLevel: vouch.trustLevel
            };

            if (vouch.voucheeI2pDestination) {
                payload.voucheeI2pDestination = vouch.voucheeI2pDestination;
            }

            const sortedKeys = Object.keys(payload).sort();
            const sortedObj: Record<string, unknown> = {};
            for (const key of sortedKeys) {
                sortedObj[key] = payload[key];
            }
            const payloadJson = JSON.stringify(sortedObj);

            return await verifySignedObject(payloadJson, vouch.gpgSignature, publicKey);
        } catch {
            return false;
        }
    }

    clearCache(): void {
        this.trustCache.clear();
    }

    isTrusted(fingerprint: string): boolean {
        const cached = this.trustCache.get(fingerprint);
        if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
            return cached.status === "trusted";
        }

        const player = this.playerRepo.getByFingerprint(fingerprint);
        return player?.trustStatus === "trusted";
    }

    markAsTrusted(fingerprint: string): void {
        this.playerRepo.updateTrustStatus(fingerprint, "trusted");
        this.trustCache.set(fingerprint, { status: "trusted", timestamp: Date.now() });
    }

    markAsBlocked(fingerprint: string): void {
        this.playerRepo.updateTrustStatus(fingerprint, "blocked");
        this.trustCache.set(fingerprint, { status: "blocked", timestamp: Date.now() });
    }
}
