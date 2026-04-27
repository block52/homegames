import { randomBytes } from "crypto";
import * as openpgp from "openpgp";
import {
    CheckIn,
    CheckInChallenge,
    CheckInResponse
} from "../types/index.js";
import { CheckInRepository } from "../storage/repositories/checkins.js";
import { GameRepository } from "../storage/repositories/games.js";
import { PlayerRepository } from "../storage/repositories/players.js";
import { Keyring } from "../crypto/keyring.js";
import { signData, verifySignature } from "../crypto/sign.js";
import { generateId, timestampNow } from "../crypto/utils.js";

const NONCE_BYTES = 16;
const MAX_CHALLENGE_AGE_SECONDS = 5 * 60; // accept challenges up to 5 minutes old

function canonicalChallenge(c: CheckInChallenge): string {
    // Stable key order so signing and verification produce the same bytes.
    return JSON.stringify({ g: c.g, h: c.h, n: c.n, t: c.t, v: c.v });
}

export class CheckInService {
    constructor(
        private checkinRepo: CheckInRepository,
        private gameRepo: GameRepository,
        private playerRepo: PlayerRepository,
        private keyring: Keyring
    ) {}

    /**
     * Host: generate a fresh challenge for a game listing they own.
     * Re-call periodically (every ~30s) to roll the nonce.
     */
    createChallenge(gameListingId: string): CheckInChallenge {
        const hostFingerprint = this.keyring.getFingerprint();
        if (!hostFingerprint) throw new Error("No identity loaded.");

        const listing = this.gameRepo.getById(gameListingId);
        if (!listing) throw new Error("Game listing not found.");
        if (listing.hostFingerprint !== hostFingerprint) {
            throw new Error("Only the host can issue check-in challenges.");
        }

        return {
            v: 1,
            k: "challenge",
            g: gameListingId,
            h: hostFingerprint,
            n: randomBytes(NONCE_BYTES).toString("hex"),
            t: timestampNow()
        };
    }

    /**
     * Player: sign a scanned challenge and produce the response payload
     * to display back to the host as a QR.
     */
    async signChallenge(challenge: CheckInChallenge): Promise<CheckInResponse> {
        if (challenge.v !== 1 || challenge.k !== "challenge") {
            throw new Error("Unrecognised challenge payload.");
        }

        const privateKey = this.keyring.getPrivateKey();
        if (!privateKey) throw new Error("Keyring is not unlocked.");

        const playerFingerprint = this.keyring.getFingerprint();
        if (!playerFingerprint) throw new Error("No identity loaded.");

        if (playerFingerprint === challenge.h) {
            throw new Error("You can't check yourself in to your own game.");
        }

        const drift = Math.abs(timestampNow() - challenge.t);
        if (drift > MAX_CHALLENGE_AGE_SECONDS) {
            throw new Error("Challenge is too old. Ask the host to refresh the QR.");
        }

        const signature = await signData(canonicalChallenge(challenge), privateKey);

        return {
            v: 1,
            k: "response",
            g: challenge.g,
            p: playerFingerprint,
            h: challenge.h,
            n: challenge.n,
            t: challenge.t,
            s: signature
        };
    }

    /**
     * Host: verify a scanned response against the original challenge
     * and persist the check-in. The challenge must be passed in so the
     * host can confirm the player's QR matches the one currently on
     * screen (defends against replays from older challenges).
     */
    async verifyAndRecord(
        challenge: CheckInChallenge,
        response: CheckInResponse
    ): Promise<CheckIn> {
        if (response.v !== 1 || response.k !== "response") {
            throw new Error("Unrecognised response payload.");
        }
        if (response.g !== challenge.g || response.n !== challenge.n
            || response.t !== challenge.t || response.h !== challenge.h) {
            throw new Error("Response doesn't match the current challenge.");
        }

        const hostFingerprint = this.keyring.getFingerprint();
        if (!hostFingerprint) throw new Error("No identity loaded.");
        if (hostFingerprint !== challenge.h) {
            throw new Error("Only the host can record check-ins for this game.");
        }

        const player = this.playerRepo.getByFingerprint(response.p);
        if (!player) {
            throw new Error("Unknown player. Import their public key first.");
        }

        const publicKey = await openpgp.readKey({ armoredKey: player.publicKeyArmored });
        const valid = await verifySignature(canonicalChallenge(challenge), response.s, publicKey);
        if (!valid) throw new Error("Signature verification failed.");

        const existing = this.checkinRepo.findExisting(challenge.g, response.p);
        if (existing) {
            throw new Error("This player has already checked in to this game.");
        }

        const checkin: CheckIn = {
            id: generateId(),
            gameListingId: challenge.g,
            playerFingerprint: response.p,
            hostFingerprint: challenge.h,
            nonce: challenge.n,
            challengeTimestamp: challenge.t,
            playerSignature: response.s,
            recordedAt: timestampNow()
        };
        return this.checkinRepo.create(checkin);
    }

    getForGame(gameListingId: string): CheckIn[] {
        return this.checkinRepo.getByGame(gameListingId);
    }
}
