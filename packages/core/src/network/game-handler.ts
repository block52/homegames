/**
 * Game Network Handler - Routes game and RSVP messages between peers
 *
 * Subscribes to MessageHandler events for GAME_LIST, GAME_DELIST,
 * RSVP_REQUEST, RSVP_RESPONSE; validates signatures via the core game
 * services; persists to repositories. Also exposes broadcast/send
 * helpers for outbound traffic.
 */

import { EventEmitter } from "events";
import { SAMStream } from "./stream-connection.js";
import { MessageHandler, GameDelistPayload, SignedRSVPPayload } from "./message-handler.js";
import { PeerManager } from "./peer-manager.js";
import { GameRepository } from "../storage/repositories/games.js";
import { RSVPRepository } from "../storage/repositories/rsvps.js";
import { GameService } from "../game/listing.js";
import { RSVPService } from "../game/rsvp.js";
import { GameListing, MessageEnvelope, RSVPRequest } from "../types/index.js";
import { isExpired } from "../crypto/utils.js";

export interface GameNetworkHandlerEvents {
    listingReceived: (listing: GameListing) => void;
    listingDelisted: (listingId: string) => void;
    rsvpReceived: (rsvp: RSVPRequest) => void;
    rsvpResponse: (rsvp: RSVPRequest) => void;
    error: (err: Error) => void;
}

export class GameNetworkHandler extends EventEmitter {
    constructor(
        private messageHandler: MessageHandler,
        private peerManager: PeerManager,
        private gameService: GameService,
        private rsvpService: RSVPService,
        private gameRepo: GameRepository,
        private rsvpRepo: RSVPRepository
    ) {
        super();
        this.subscribe();
    }

    private subscribe(): void {
        this.messageHandler.on("game_list", (listing, envelope, _stream) => {
            this.handleGameList(listing, envelope).catch((err) => this.emit("error", err));
        });

        this.messageHandler.on("game_delist", (payload, envelope, _stream) => {
            this.handleGameDelist(payload, envelope).catch((err) => this.emit("error", err));
        });

        this.messageHandler.on("rsvp_request", (payload, _envelope, _stream) => {
            this.handleRSVPRequest(payload).catch((err) => this.emit("error", err));
        });

        this.messageHandler.on("rsvp_response", (payload, _envelope, _stream) => {
            this.handleRSVPResponse(payload).catch((err) => this.emit("error", err));
        });

        this.peerManager.on("peerConnected", (_fingerprint, stream) => {
            this.rebroadcastActiveListings(stream).catch((err) => this.emit("error", err));
        });
    }

    async broadcastListing(listing: GameListing): Promise<void> {
        const envelope = await this.messageHandler.createGameListMessage(listing);
        await this.messageHandler.broadcastMessage(this.peerManager.getAllStreams(), envelope);
    }

    async broadcastDelist(listingId: string): Promise<void> {
        const envelope = await this.messageHandler.createGameDelistMessage(listingId);
        await this.messageHandler.broadcastMessage(this.peerManager.getAllStreams(), envelope);
    }

    async sendRSVPRequest(signed: SignedRSVPPayload, hostFingerprint: string): Promise<void> {
        const stream = await this.ensureStream(hostFingerprint);
        const envelope = await this.messageHandler.createRSVPRequestMessage(signed, hostFingerprint);
        await this.messageHandler.sendMessage(stream, envelope);
    }

    async sendRSVPResponse(signed: SignedRSVPPayload, playerFingerprint: string): Promise<void> {
        const stream = await this.ensureStream(playerFingerprint);
        const envelope = await this.messageHandler.createRSVPResponseMessage(signed, playerFingerprint);
        await this.messageHandler.sendMessage(stream, envelope);
    }

    private async handleGameList(listing: GameListing, envelope: MessageEnvelope): Promise<void> {
        if (envelope.fromFingerprint !== listing.hostFingerprint) return;
        if (isExpired(listing.expiresAt)) return;

        const valid = await this.gameService.verifyListing(listing);
        if (!valid) return;

        this.gameRepo.upsert(listing);
        this.emit("listingReceived", listing);
    }

    private async handleGameDelist(payload: GameDelistPayload, envelope: MessageEnvelope): Promise<void> {
        const existing = this.gameRepo.getById(payload.listingId);
        if (!existing) return;
        if (existing.hostFingerprint !== envelope.fromFingerprint) return;

        this.gameRepo.delete(payload.listingId);
        this.rsvpRepo.deleteByGame(payload.listingId);
        this.emit("listingDelisted", payload.listingId);
    }

    private async handleRSVPRequest(payload: SignedRSVPPayload): Promise<void> {
        const valid = await this.rsvpService.verifyRSVP(payload.rsvp, payload.signature);
        if (!valid) return;

        const listing = this.gameRepo.getById(payload.rsvp.gameListingId);
        if (!listing) return;
        if (isExpired(listing.expiresAt)) return;

        const existing = this.rsvpRepo.findExisting(payload.rsvp.gameListingId, payload.rsvp.playerFingerprint);
        if (existing) return;

        this.rsvpRepo.create(payload.rsvp);
        this.emit("rsvpReceived", payload.rsvp);
    }

    private async handleRSVPResponse(payload: SignedRSVPPayload): Promise<void> {
        const valid = await this.rsvpService.verifyRSVP(payload.rsvp, payload.signature);
        if (!valid) return;

        const existing = this.rsvpRepo.getById(payload.rsvp.id);
        if (!existing) return;

        this.rsvpRepo.updateStatus(payload.rsvp.id, payload.rsvp.status);
        this.emit("rsvpResponse", payload.rsvp);
    }

    private async rebroadcastActiveListings(stream: SAMStream): Promise<void> {
        const active = this.gameRepo.getActive();
        for (const listing of active) {
            const envelope = await this.messageHandler.createGameListMessage(listing);
            await this.messageHandler.sendMessage(stream, envelope);
        }
    }

    private async ensureStream(fingerprint: string): Promise<SAMStream> {
        const existing = this.peerManager.getStream(fingerprint);
        if (existing) return existing;
        return this.peerManager.connectByFingerprint(fingerprint);
    }
}
