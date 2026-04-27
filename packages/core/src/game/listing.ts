import { createHash } from "crypto";
import * as openpgp from "openpgp";
import {
    GameListing,
    GamePublicData,
    GamePrivateData,
    Player
} from "../types/index.js";
import { GameRepository } from "../storage/repositories/games.js";
import { PlayerRepository } from "../storage/repositories/players.js";
import { Keyring } from "../crypto/keyring.js";
import { TrustEngine } from "../trust/calculate.js";
import {
    signData,
    verifySignature,
    createSignablePayload,
    timestampNow
} from "../crypto/index.js";
import { encryptPrivateData, EncryptedRecipient } from "./encrypt.js";

export interface CreateListingParams {
    publicData: GamePublicData;
    privateData?: GamePrivateData;
    expiresAt: number;
}

interface ListingSignablePayload extends Record<string, unknown> {
    listingId: string;
    hostFingerprint: string;
    publicDataJson: string;
    encryptedDataBlob: string | null;
    createdAt: number;
    expiresAt: number;
}

function computeListingId(
    hostFingerprint: string,
    publicDataJson: string,
    createdAt: number
): string {
    return createHash("sha256")
        .update(`${hostFingerprint}|${createdAt}|${publicDataJson}`)
        .digest("hex");
}

function buildSignablePayload(listing: GameListing): ListingSignablePayload {
    return {
        listingId: listing.listingId,
        hostFingerprint: listing.hostFingerprint,
        publicDataJson: listing.publicDataJson,
        encryptedDataBlob: listing.encryptedDataBlob || null,
        createdAt: listing.createdAt,
        expiresAt: listing.expiresAt
    };
}

export class GameService {
    constructor(
        private gameRepo: GameRepository,
        private playerRepo: PlayerRepository,
        private trustEngine: TrustEngine,
        private keyring: Keyring
    ) {}

    async createListing(params: CreateListingParams): Promise<GameListing> {
        const privateKey = this.keyring.getPrivateKey();
        if (!privateKey) {
            throw new Error("Keyring is not unlocked. Please unlock your identity first.");
        }

        const hostFingerprint = this.keyring.getFingerprint();
        if (!hostFingerprint) {
            throw new Error("No identity loaded in keyring.");
        }

        if (params.expiresAt <= timestampNow()) {
            throw new Error("expiresAt must be in the future.");
        }

        const publicWithHost: GamePublicData = {
            ...params.publicData,
            hostFingerprint
        };
        const publicDataJson = JSON.stringify(publicWithHost);

        let encryptedDataBlob: string | undefined;
        if (params.privateData) {
            const recipients = await this.collectTrustedRecipients(hostFingerprint);
            encryptedDataBlob = await encryptPrivateData(params.privateData, recipients, privateKey);
        }

        const createdAt = timestampNow();
        const listingId = computeListingId(hostFingerprint, publicDataJson, createdAt);

        const draft: GameListing = {
            listingId,
            hostFingerprint,
            publicDataJson,
            encryptedDataBlob,
            signature: "",
            createdAt,
            expiresAt: params.expiresAt
        };

        const signablePayload = createSignablePayload(buildSignablePayload(draft));
        const signature = await signData(signablePayload, privateKey);

        const listing: GameListing = { ...draft, signature };
        return this.gameRepo.upsert(listing);
    }

    async reEncryptForCurrentTrustSet(listingId: string, privateData: GamePrivateData): Promise<GameListing> {
        const existing = this.gameRepo.getById(listingId);
        if (!existing) {
            throw new Error("Listing not found.");
        }

        const privateKey = this.keyring.getPrivateKey();
        if (!privateKey) {
            throw new Error("Keyring is not unlocked.");
        }

        const hostFingerprint = this.keyring.getFingerprint();
        if (hostFingerprint !== existing.hostFingerprint) {
            throw new Error("Only the host can re-encrypt their listing.");
        }

        const recipients = await this.collectTrustedRecipients(hostFingerprint);
        const encryptedDataBlob = await encryptPrivateData(privateData, recipients, privateKey);

        const updatedDraft: GameListing = {
            ...existing,
            encryptedDataBlob,
            signature: ""
        };
        const signablePayload = createSignablePayload(buildSignablePayload(updatedDraft));
        const signature = await signData(signablePayload, privateKey);

        const updated: GameListing = { ...updatedDraft, signature };
        return this.gameRepo.upsert(updated);
    }

    async verifyListing(listing: GameListing): Promise<boolean> {
        const host = this.playerRepo.getByFingerprint(listing.hostFingerprint);
        if (!host) return false;

        try {
            const hostKey = await openpgp.readKey({ armoredKey: host.publicKeyArmored });
            const expectedId = computeListingId(
                listing.hostFingerprint,
                listing.publicDataJson,
                listing.createdAt
            );
            if (expectedId !== listing.listingId) return false;

            const signablePayload = createSignablePayload(buildSignablePayload(listing));
            return await verifySignature(signablePayload, listing.signature, hostKey);
        } catch {
            return false;
        }
    }

    parsePublicData(listing: GameListing): GamePublicData {
        return JSON.parse(listing.publicDataJson) as GamePublicData;
    }

    delete(listingId: string): void {
        const hostFingerprint = this.keyring.getFingerprint();
        if (!hostFingerprint) {
            throw new Error("No identity loaded in keyring.");
        }
        const listing = this.gameRepo.getById(listingId);
        if (!listing) return;
        if (listing.hostFingerprint !== hostFingerprint) {
            throw new Error("Only the host can delete this listing.");
        }
        this.gameRepo.delete(listingId);
    }

    private async collectTrustedRecipients(hostFingerprint: string): Promise<EncryptedRecipient[]> {
        const recipients: EncryptedRecipient[] = [];

        // The host is always a recipient — you can read your own listings
        // regardless of how many vouches you have. Trust calculation would
        // mark you as untrusted (no self-vouching), which would downgrade
        // your DB row and leave the recipient list empty.
        const host = this.playerRepo.getByFingerprint(hostFingerprint);
        if (host) {
            recipients.push({
                fingerprint: host.gpgFingerprint,
                publicKeyArmored: host.publicKeyArmored
            });
        }

        const trusted: Player[] = this.playerRepo.getByTrustStatus("trusted");
        for (const player of trusted) {
            if (player.gpgFingerprint === hostFingerprint) continue;
            const result = await this.trustEngine.calculateTrust(player.gpgFingerprint);
            if (result.status === "trusted") {
                recipients.push({
                    fingerprint: player.gpgFingerprint,
                    publicKeyArmored: player.publicKeyArmored
                });
            }
        }

        return recipients;
    }
}

export { computeListingId };
