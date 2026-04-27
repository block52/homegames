import { ipcMain } from "electron";
import * as openpgp from "openpgp";
import {
    encryptSymmetric,
    decryptSymmetric,
    decryptPrivateData,
    searchListings,
    timestampNow,
    GamePublicData,
    GameListing
} from "@homegames/core";
import { getServices } from "./services.js";
import type {
    HomeGamesAPI,
    IdentitySummary,
    GameDetailDTO,
    SearchResultDTO,
    KeyringStatus,
    CheckInRecordedDTO
} from "../shared/api.js";

type Handler<T extends (...args: never[]) => unknown> = (
    _event: Electron.IpcMainInvokeEvent,
    ...args: Parameters<T>
) => Promise<Awaited<ReturnType<T>>>;

function handle<T extends (...args: never[]) => unknown>(channel: string, fn: Handler<T>) {
    ipcMain.handle(channel, fn as never);
}

export function registerIpcHandlers(): void {
    // ─── Identity ───────────────────────────────────────────────────────
    handle<HomeGamesAPI["identity"]["get"]>("identity:get", async () => {
        const { identityRepo } = getServices();
        const local = identityRepo.get();
        if (!local) return null;
        return {
            fingerprint: local.fingerprint,
            publicKeyArmored: local.publicKey,
            createdAt: local.createdAt
        } satisfies IdentitySummary;
    });

    handle<HomeGamesAPI["identity"]["create"]>("identity:create", async (_e, params) => {
        const { identityRepo, playerRepo, keyring } = getServices();

        const result = await keyring.generateKey({
            name: params.name,
            email: params.email,
            passphrase: params.passphrase,
            keyType: "ecc"
        });

        const encryptedPrivateKey = await encryptSymmetric(result.privateKeyArmored, params.passphrase);

        identityRepo.set(result.fingerprint, encryptedPrivateKey, result.publicKeyArmored);
        playerRepo.create({
            gpgFingerprint: result.fingerprint,
            publicKeyArmored: result.publicKeyArmored,
            trustStatus: "trusted"
        });

        await keyring.unlockKey(result.privateKeyArmored, params.passphrase);
        await keyring.loadPublicKey(result.publicKeyArmored);

        const created = identityRepo.get();
        return {
            fingerprint: result.fingerprint,
            publicKeyArmored: result.publicKeyArmored,
            createdAt: created?.createdAt ?? timestampNow()
        } satisfies IdentitySummary;
    });

    // ─── Keyring ────────────────────────────────────────────────────────
    handle<HomeGamesAPI["keyring"]["unlock"]>("keyring:unlock", async (_e, passphrase) => {
        const { identityRepo, keyring } = getServices();
        const local = identityRepo.get();
        if (!local) throw new Error("No identity found");

        try {
            const privateKeyArmored = await decryptSymmetric(local.privateKeyEncrypted, passphrase);
            await keyring.unlockKey(privateKeyArmored, passphrase);
            await keyring.loadPublicKey(local.publicKey);
            return true;
        } catch {
            return false;
        }
    });

    handle<HomeGamesAPI["keyring"]["lock"]>("keyring:lock", async () => {
        const { keyring } = getServices();
        keyring.lock();
    });

    handle<HomeGamesAPI["keyring"]["status"]>("keyring:status", async () => {
        const { keyring } = getServices();
        return {
            unlocked: keyring.isUnlocked(),
            fingerprint: keyring.getFingerprint()
        } satisfies KeyringStatus;
    });

    // ─── Peers ──────────────────────────────────────────────────────────
    handle<HomeGamesAPI["peers"]["list"]>("peers:list", async () => {
        const { playerRepo } = getServices();
        return playerRepo.getAll();
    });

    // ─── Vouches ────────────────────────────────────────────────────────
    handle<HomeGamesAPI["vouches"]["listMine"]>("vouches:listMine", async () => {
        const { vouchService } = getServices();
        return vouchService.getMyVouches();
    });

    handle<HomeGamesAPI["vouches"]["create"]>(
        "vouches:create",
        async (_e, voucheeFingerprint, trustLevel, note) => {
            const { vouchService } = getServices();
            return vouchService.createVouch({ voucheeFingerprint, trustLevel, note });
        }
    );

    // ─── Games ──────────────────────────────────────────────────────────
    handle<HomeGamesAPI["games"]["list"]>("games:list", async (_e, filters) => {
        const { gameRepo, identityRepo } = getServices();
        let listings: GameListing[];
        if (filters?.mine) {
            const me = identityRepo.get();
            listings = me ? gameRepo.getByHost(me.fingerprint) : [];
        } else {
            listings = gameRepo.getActive();
        }
        const results = searchListings(listings, {
            gameType: filters?.gameType,
            stakesRange: filters?.stakesRange,
            generalArea: filters?.generalArea
        });
        return results as SearchResultDTO[];
    });

    handle<HomeGamesAPI["games"]["create"]>("games:create", async (_e, params) => {
        const { gameService, keyring } = getServices();
        if (!keyring.isUnlocked()) throw new Error("Identity is locked");

        const fingerprint = keyring.getFingerprint();
        if (!fingerprint) throw new Error("No identity loaded");

        const publicData: GamePublicData = {
            ...params.publicData,
            hostFingerprint: fingerprint
        };
        if (params.expiresAt <= timestampNow()) {
            throw new Error("Start time must be in the future.");
        }
        return gameService.createListing({
            publicData,
            privateData: params.privateData,
            expiresAt: params.expiresAt
        });
    });

    handle<HomeGamesAPI["games"]["show"]>("games:show", async (_e, listingId) => {
        const { gameRepo, rsvpRepo, checkinRepo, identityRepo, playerRepo, keyring } = getServices();

        let listing = gameRepo.getById(listingId);
        if (!listing) {
            const all = gameRepo.getAll();
            listing = all.find((g) => g.listingId.startsWith(listingId)) || null;
        }
        if (!listing) return null;

        const publicData = JSON.parse(listing.publicDataJson) as GamePublicData;
        const me = identityRepo.get();
        const isHost = me?.fingerprint === listing.hostFingerprint;
        // Hosts see every RSVP; non-hosts only see their own row so they
        // know whether they've already RSVPed without leaking other guests.
        const allRsvps = rsvpRepo.getByGame(listing.listingId);
        const rsvps = isHost
            ? allRsvps
            : allRsvps.filter((r) => r.playerFingerprint === me?.fingerprint);

        const allCheckins = checkinRepo.getByGame(listing.listingId);
        const checkins = isHost ? allCheckins : [];
        const myCheckIn = me
            ? allCheckins.find((c) => c.playerFingerprint === me.fingerprint)
            : undefined;

        const detail: GameDetailDTO = { listing, publicData, rsvps, checkins, myCheckIn, isHost };

        if (listing.encryptedDataBlob && keyring.isUnlocked()) {
            const privateKey = keyring.getPrivateKey();
            const host = playerRepo.getByFingerprint(listing.hostFingerprint);
            const hostKey = host ? await openpgp.readKey({ armoredKey: host.publicKeyArmored }) : undefined;
            try {
                const { data } = await decryptPrivateData(listing.encryptedDataBlob, privateKey!, hostKey);
                detail.privateData = data;
            } catch {
                detail.privateDataError = "Private details are not encrypted to your key.";
            }
        } else if (listing.encryptedDataBlob) {
            detail.privateDataError = "Unlock your identity to attempt decryption.";
        }

        return detail;
    });

    handle<HomeGamesAPI["games"]["rsvp"]>("games:rsvp", async (_e, listingId, note) => {
        const { rsvpService, gameRepo } = getServices();
        let listing = gameRepo.getById(listingId);
        if (!listing) {
            const all = gameRepo.getAll();
            listing = all.find((g) => g.listingId.startsWith(listingId)) || null;
        }
        if (!listing) throw new Error("Listing not found");
        const signed = await rsvpService.requestRSVP(listing.listingId, note);
        return signed.rsvp;
    });

    handle<HomeGamesAPI["games"]["cancel"]>("games:cancel", async (_e, listingId) => {
        const { gameService, rsvpRepo, gameRepo } = getServices();
        let listing = gameRepo.getById(listingId);
        if (!listing) {
            const all = gameRepo.getAll();
            listing = all.find((g) => g.listingId.startsWith(listingId)) || null;
        }
        if (!listing) throw new Error("Listing not found");
        gameService.delete(listing.listingId);
        rsvpRepo.deleteByGame(listing.listingId);
    });

    // ─── Check-ins ──────────────────────────────────────────────────────
    handle<HomeGamesAPI["checkins"]["createChallenge"]>("checkins:createChallenge", async (_e, gameListingId) => {
        const { checkinService } = getServices();
        return checkinService.createChallenge(gameListingId);
    });

    handle<HomeGamesAPI["checkins"]["signChallenge"]>("checkins:signChallenge", async (_e, challenge) => {
        const { checkinService } = getServices();
        return checkinService.signChallenge(challenge);
    });

    handle<HomeGamesAPI["checkins"]["verifyAndRecord"]>(
        "checkins:verifyAndRecord",
        async (_e, challenge, response) => {
            const { checkinService, playerRepo } = getServices();
            const checkin = await checkinService.verifyAndRecord(challenge, response);
            const player = playerRepo.getByFingerprint(checkin.playerFingerprint);
            let playerNickname: string | undefined;
            if (player?.profileJson) {
                try { playerNickname = (JSON.parse(player.profileJson) as { nickname?: string }).nickname; }
                catch { /* ignore */ }
            }
            return { checkin, playerNickname } satisfies CheckInRecordedDTO;
        }
    );

    handle<HomeGamesAPI["checkins"]["listForGame"]>("checkins:listForGame", async (_e, gameListingId) => {
        const { checkinService } = getServices();
        return checkinService.getForGame(gameListingId);
    });
}
