import * as openpgp from "openpgp";
import { RSVPRequest } from "../types/index.js";
import { RSVPRepository } from "../storage/repositories/rsvps.js";
import { GameRepository } from "../storage/repositories/games.js";
import { PlayerRepository } from "../storage/repositories/players.js";
import { Keyring } from "../crypto/keyring.js";
import {
    signObject,
    verifySignedObject,
    timestampNow,
    isExpired,
    generateId
} from "../crypto/index.js";

export interface RSVPSignedPayload extends Record<string, unknown> {
    id: string;
    gameListingId: string;
    playerFingerprint: string;
    status: RSVPRequest["status"];
    timestamp: number;
}

export interface SignedRSVP {
    rsvp: RSVPRequest;
    signature: string;
}

export class RSVPService {
    constructor(
        private rsvpRepo: RSVPRepository,
        private gameRepo: GameRepository,
        private playerRepo: PlayerRepository,
        private keyring: Keyring
    ) {}

    async requestRSVP(gameListingId: string): Promise<SignedRSVP> {
        const privateKey = this.keyring.getPrivateKey();
        if (!privateKey) {
            throw new Error("Keyring is not unlocked.");
        }

        const playerFingerprint = this.keyring.getFingerprint();
        if (!playerFingerprint) {
            throw new Error("No identity loaded in keyring.");
        }

        const listing = this.gameRepo.getById(gameListingId);
        if (!listing) {
            throw new Error("Game listing not found.");
        }
        if (isExpired(listing.expiresAt)) {
            throw new Error("This game listing has expired.");
        }
        if (listing.hostFingerprint === playerFingerprint) {
            throw new Error("You cannot RSVP to your own game.");
        }

        const existing = this.rsvpRepo.findExisting(gameListingId, playerFingerprint);
        if (existing) {
            throw new Error("You have already RSVPed to this game.");
        }

        const rsvp: RSVPRequest = {
            id: generateId(),
            gameListingId,
            playerFingerprint,
            status: "pending",
            timestamp: timestampNow()
        };

        const payload: RSVPSignedPayload = { ...rsvp };
        const { signature } = await signObject(payload, privateKey);

        this.rsvpRepo.create(rsvp);
        return { rsvp, signature };
    }

    async respondToRSVP(rsvpId: string, accept: boolean): Promise<SignedRSVP> {
        const privateKey = this.keyring.getPrivateKey();
        if (!privateKey) {
            throw new Error("Keyring is not unlocked.");
        }

        const hostFingerprint = this.keyring.getFingerprint();
        if (!hostFingerprint) {
            throw new Error("No identity loaded in keyring.");
        }

        const rsvp = this.rsvpRepo.getById(rsvpId);
        if (!rsvp) {
            throw new Error("RSVP not found.");
        }

        const listing = this.gameRepo.getById(rsvp.gameListingId);
        if (!listing) {
            throw new Error("Game listing not found.");
        }
        if (listing.hostFingerprint !== hostFingerprint) {
            throw new Error("Only the host can respond to this RSVP.");
        }

        const newStatus: RSVPRequest["status"] = accept ? "accepted" : "declined";
        this.rsvpRepo.updateStatus(rsvpId, newStatus);

        const updated: RSVPRequest = { ...rsvp, status: newStatus, timestamp: timestampNow() };
        const payload: RSVPSignedPayload = { ...updated };
        const { signature } = await signObject(payload, privateKey);

        return { rsvp: updated, signature };
    }

    async verifyRSVP(rsvp: RSVPRequest, signature: string): Promise<boolean> {
        const player = this.playerRepo.getByFingerprint(rsvp.playerFingerprint);
        if (!player) return false;

        try {
            const publicKey = await openpgp.readKey({ armoredKey: player.publicKeyArmored });
            const payload: RSVPSignedPayload = { ...rsvp };
            const sortedKeys = Object.keys(payload).sort();
            const sortedObj: Record<string, unknown> = {};
            for (const key of sortedKeys) {
                sortedObj[key] = payload[key];
            }
            return await verifySignedObject(JSON.stringify(sortedObj), signature, publicKey);
        } catch {
            return false;
        }
    }

    getForGame(gameListingId: string): RSVPRequest[] {
        return this.rsvpRepo.getByGame(gameListingId);
    }

    getMyRSVPs(): RSVPRequest[] {
        const fingerprint = this.keyring.getFingerprint();
        if (!fingerprint) {
            throw new Error("No identity loaded in keyring.");
        }
        return this.rsvpRepo.getByPlayer(fingerprint);
    }
}
