import * as openpgp from "openpgp";
import { Vouch, VouchCreateParams, VouchVerificationResult, VOUCH_REQUIREMENTS, TrustLevel } from "../types/index.js";
import { VouchRepository } from "../storage/repositories/vouches.js";
import { PlayerRepository } from "../storage/repositories/players.js";
import { signObject, verifySignedObject, generateId, timestampNow, addDays } from "../crypto/index.js";
import { Keyring } from "../crypto/keyring.js";

export interface VouchPayload {
    voucheeGpgFingerprint: string;
    voucheeI2pDestination?: string;
    voucherGpgFingerprint: string;
    timestamp: number;
    trustLevel: TrustLevel;
}

export class VouchService {
    constructor(
        private vouchRepo: VouchRepository,
        private playerRepo: PlayerRepository,
        private keyring: Keyring
    ) {}

    async createVouch(params: VouchCreateParams): Promise<Vouch> {
        const privateKey = this.keyring.getPrivateKey();
        if (!privateKey) {
            throw new Error("Keyring is not unlocked. Please unlock your identity first.");
        }

        const voucherFingerprint = this.keyring.getFingerprint();
        if (!voucherFingerprint) {
            throw new Error("No identity loaded in keyring.");
        }

        // Check if voucher is trying to vouch for themselves
        if (voucherFingerprint === params.voucheeFingerprint) {
            throw new Error("You cannot vouch for yourself.");
        }

        // Check if vouchee exists
        if (!this.playerRepo.exists(params.voucheeFingerprint)) {
            throw new Error("Player not found. Import their public key first.");
        }

        // Check if vouch already exists
        const existingVouch = this.vouchRepo.getVouchBetween(voucherFingerprint, params.voucheeFingerprint);
        if (existingVouch && !existingVouch.revokedAt) {
            throw new Error("You have already vouched for this player.");
        }

        // Check cooling period for new vouchers
        const voucher = this.playerRepo.getByFingerprint(voucherFingerprint);
        if (voucher) {
            const coolingPeriodEnd = addDays(voucher.firstSeen, VOUCH_REQUIREMENTS.COOLING_PERIOD_DAYS);
            if (timestampNow() < coolingPeriodEnd) {
                const daysRemaining = Math.ceil((coolingPeriodEnd - timestampNow()) / (24 * 60 * 60));
                throw new Error(`You must wait ${daysRemaining} more days before you can vouch for others.`);
            }
        }

        // Check monthly vouch limit
        const thirtyDaysAgo = timestampNow() - 30 * 24 * 60 * 60;
        const vouchesThisMonth = this.vouchRepo.countVouchesGivenInPeriod(voucherFingerprint, thirtyDaysAgo);
        if (vouchesThisMonth >= VOUCH_REQUIREMENTS.MAX_VOUCHES_PER_MONTH) {
            throw new Error(`You have reached the maximum of ${VOUCH_REQUIREMENTS.MAX_VOUCHES_PER_MONTH} vouches per month.`);
        }

        // Create vouch payload
        const payload: VouchPayload = {
            voucheeGpgFingerprint: params.voucheeFingerprint,
            voucheeI2pDestination: params.voucheeI2pDestination,
            voucherGpgFingerprint: voucherFingerprint,
            timestamp: timestampNow(),
            trustLevel: params.trustLevel
        };

        // Sign the vouch
        const { signature } = await signObject(payload as unknown as Record<string, unknown>, privateKey);

        // Create the vouch record
        const vouch: Omit<Vouch, "id"> = {
            voucheeGpgFingerprint: params.voucheeFingerprint,
            voucheeI2pDestination: params.voucheeI2pDestination,
            voucherGpgFingerprint: voucherFingerprint,
            timestamp: payload.timestamp,
            trustLevel: params.trustLevel,
            gpgSignature: signature
        };

        // Handle encrypted note if provided
        if (params.note) {
            // For now, store plaintext. In production, encrypt to vouchee's key
            vouch.noteEncrypted = params.note;
        }

        return this.vouchRepo.create(vouch);
    }

    async verifyVouch(vouch: Vouch): Promise<VouchVerificationResult> {
        try {
            // Get voucher's public key
            const voucher = this.playerRepo.getByFingerprint(vouch.voucherGpgFingerprint);
            if (!voucher) {
                return { valid: false, error: "Voucher not found" };
            }

            // Parse the public key
            const publicKey = await openpgp.readKey({ armoredKey: voucher.publicKeyArmored });

            // Reconstruct the payload that was signed
            const payload: VouchPayload = {
                voucheeGpgFingerprint: vouch.voucheeGpgFingerprint,
                voucheeI2pDestination: vouch.voucheeI2pDestination,
                voucherGpgFingerprint: vouch.voucherGpgFingerprint,
                timestamp: vouch.timestamp,
                trustLevel: vouch.trustLevel
            };

            // Create canonical JSON for verification
            const sortedKeys = Object.keys(payload).sort();
            const sortedObj: Record<string, unknown> = {};
            for (const key of sortedKeys) {
                const value = payload[key as keyof VouchPayload];
                if (value !== undefined) {
                    sortedObj[key] = value;
                }
            }
            const payloadJson = JSON.stringify(sortedObj);

            // Verify the signature
            const valid = await verifySignedObject(payloadJson, vouch.gpgSignature, publicKey);
            if (!valid) {
                return { valid: false, error: "Invalid signature" };
            }

            return { valid: true, vouch };
        } catch (error) {
            return { valid: false, error: (error as Error).message };
        }
    }

    revokeVouch(voucheeFingerprint: string): void {
        const voucherFingerprint = this.keyring.getFingerprint();
        if (!voucherFingerprint) {
            throw new Error("No identity loaded in keyring.");
        }

        const vouch = this.vouchRepo.getVouchBetween(voucherFingerprint, voucheeFingerprint);
        if (!vouch) {
            throw new Error("No vouch found for this player.");
        }

        if (vouch.revokedAt) {
            throw new Error("This vouch has already been revoked.");
        }

        this.vouchRepo.revokeByFingerprints(voucherFingerprint, voucheeFingerprint);
    }

    getVouchesFor(fingerprint: string): Vouch[] {
        return this.vouchRepo.getVouchesFor(fingerprint);
    }

    getVouchesBy(fingerprint: string): Vouch[] {
        return this.vouchRepo.getVouchesBy(fingerprint);
    }

    getMyVouches(): Vouch[] {
        const fingerprint = this.keyring.getFingerprint();
        if (!fingerprint) {
            throw new Error("No identity loaded in keyring.");
        }
        return this.vouchRepo.getVouchesBy(fingerprint);
    }
}
