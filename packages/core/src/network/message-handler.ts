/**
 * Message Handler - Routes and processes P2P messages
 *
 * Handles:
 * - Creating and signing message envelopes
 * - Verifying incoming message signatures
 * - Routing messages by type
 * - Broadcasting to multiple peers
 */

import { EventEmitter } from "events";
import * as openpgp from "openpgp";
import { SAMStream } from "./stream-connection.js";
import {
    MessageType,
    MessageEnvelope,
    PeerAnnounce,
    PeerDiscover
} from "../types/message.js";
import { GameListing, RSVPRequest } from "../types/index.js";
import { PlayerRepository } from "../storage/repositories/players.js";
import { timestampNow } from "../crypto/utils.js";

export interface GameDelistPayload {
    listingId: string;
}

export interface SignedRSVPPayload {
    rsvp: RSVPRequest;
    signature: string;
}

export interface MessageHandlerEvents {
    message: (envelope: MessageEnvelope, stream: SAMStream) => void;
    peer_announce: (announce: PeerAnnounce, stream: SAMStream) => void;
    peer_discover: (request: PeerDiscover, stream: SAMStream) => void;
    vouch_create: (payload: unknown, stream: SAMStream) => void;
    vouch_revoke: (payload: unknown, stream: SAMStream) => void;
    game_list: (listing: GameListing, envelope: MessageEnvelope, stream: SAMStream) => void;
    game_delist: (payload: GameDelistPayload, envelope: MessageEnvelope, stream: SAMStream) => void;
    rsvp_request: (payload: SignedRSVPPayload, envelope: MessageEnvelope, stream: SAMStream) => void;
    rsvp_response: (payload: SignedRSVPPayload, envelope: MessageEnvelope, stream: SAMStream) => void;
    direct_message: (payload: unknown, stream: SAMStream) => void;
    error: (err: Error, stream?: SAMStream) => void;
}

export interface MessageHandlerConfig {
    maxTimestampDrift: number;  // Max allowed timestamp drift in seconds
}

const DEFAULT_CONFIG: MessageHandlerConfig = {
    maxTimestampDrift: 300  // 5 minutes
};

export class MessageHandler extends EventEmitter {
    private localFingerprint: string;
    private privateKey: openpgp.PrivateKey;
    private playerRepo: PlayerRepository;
    private config: MessageHandlerConfig;

    constructor(
        localFingerprint: string,
        privateKey: openpgp.PrivateKey,
        playerRepo: PlayerRepository,
        config: Partial<MessageHandlerConfig> = {}
    ) {
        super();
        this.localFingerprint = localFingerprint;
        this.privateKey = privateKey;
        this.playerRepo = playerRepo;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Create and sign a message envelope
     */
    async createEnvelope(
        type: MessageType,
        payload: unknown,
        toFingerprint?: string
    ): Promise<MessageEnvelope> {
        const payloadJson = JSON.stringify(payload);

        const envelope: Omit<MessageEnvelope, "signature"> = {
            version: 1,
            type,
            fromFingerprint: this.localFingerprint,
            toFingerprint,
            timestamp: timestampNow(),
            payload: payloadJson
        };

        // Sign the envelope
        const signature = await this.signEnvelope(envelope);

        return {
            ...envelope,
            signature
        };
    }

    /**
     * Create a peer announce message
     */
    async createPeerAnnounce(
        i2pDestination: string,
        publicKeyArmored: string,
        profileJson?: string
    ): Promise<MessageEnvelope> {
        const payload: PeerAnnounce = {
            gpgFingerprint: this.localFingerprint,
            i2pDestination,
            publicKeyArmored,
            profileJson
        };

        return this.createEnvelope(MessageType.PEER_ANNOUNCE, payload);
    }

    /**
     * Create a peer discover request
     */
    async createPeerDiscover(maxPeers?: number): Promise<MessageEnvelope> {
        const payload: PeerDiscover = {
            requestingFingerprint: this.localFingerprint,
            maxPeers
        };

        return this.createEnvelope(MessageType.PEER_DISCOVER, payload);
    }

    async createGameListMessage(listing: GameListing): Promise<MessageEnvelope> {
        return this.createEnvelope(MessageType.GAME_LIST, listing);
    }

    async createGameDelistMessage(listingId: string): Promise<MessageEnvelope> {
        const payload: GameDelistPayload = { listingId };
        return this.createEnvelope(MessageType.GAME_DELIST, payload);
    }

    async createRSVPRequestMessage(
        signed: SignedRSVPPayload,
        toFingerprint: string
    ): Promise<MessageEnvelope> {
        return this.createEnvelope(MessageType.RSVP_REQUEST, signed, toFingerprint);
    }

    async createRSVPResponseMessage(
        signed: SignedRSVPPayload,
        toFingerprint: string
    ): Promise<MessageEnvelope> {
        return this.createEnvelope(MessageType.RSVP_RESPONSE, signed, toFingerprint);
    }

    /**
     * Send a message over a stream
     */
    async sendMessage(stream: SAMStream, envelope: MessageEnvelope): Promise<void> {
        await stream.writeJSON(envelope);
    }

    /**
     * Broadcast a message to multiple streams
     */
    async broadcastMessage(streams: SAMStream[], envelope: MessageEnvelope): Promise<void> {
        const promises = streams.map(stream =>
            this.sendMessage(stream, envelope).catch(err => {
                this.emit("error", err, stream);
            })
        );

        await Promise.all(promises);
    }

    /**
     * Handle an incoming message from a stream
     */
    async handleIncoming(stream: SAMStream, data: Buffer): Promise<void> {
        try {
            const envelope = JSON.parse(data.toString("utf-8")) as MessageEnvelope;

            // Validate envelope structure
            this.validateEnvelopeStructure(envelope);

            // Check timestamp drift
            this.validateTimestamp(envelope.timestamp);

            // Verify signature
            const valid = await this.verifySignature(envelope);
            if (!valid) {
                throw new Error("Invalid message signature");
            }

            // Emit generic message event
            this.emit("message", envelope, stream);

            // Parse and emit type-specific event
            const payload = JSON.parse(envelope.payload);
            this.emitTypedEvent(envelope.type, payload, envelope, stream);

        } catch (err) {
            this.emit("error", err as Error, stream);
        }
    }

    /**
     * Attach message handler to a stream
     */
    attachToStream(stream: SAMStream): void {
        stream.on("message", (data: Buffer) => {
            this.handleIncoming(stream, data);
        });
    }

    /**
     * Sign an envelope (without the signature field)
     */
    private async signEnvelope(envelope: Omit<MessageEnvelope, "signature">): Promise<string> {
        // Create deterministic JSON for signing
        const toSign = JSON.stringify({
            version: envelope.version,
            type: envelope.type,
            fromFingerprint: envelope.fromFingerprint,
            toFingerprint: envelope.toFingerprint,
            timestamp: envelope.timestamp,
            payload: envelope.payload
        });

        const message = await openpgp.createMessage({ text: toSign });
        const signature = await openpgp.sign({
            message,
            signingKeys: this.privateKey,
            detached: true
        });

        return signature as string;
    }

    /**
     * Verify a message signature
     */
    private async verifySignature(envelope: MessageEnvelope): Promise<boolean> {
        // Get sender's public key
        const sender = this.playerRepo.getByFingerprint(envelope.fromFingerprint);
        if (!sender) {
            // Unknown sender - can't verify
            // For PEER_ANNOUNCE, we extract the key from the payload
            if (envelope.type === MessageType.PEER_ANNOUNCE) {
                const payload = JSON.parse(envelope.payload) as PeerAnnounce;
                return this.verifyWithKey(envelope, payload.publicKeyArmored);
            }
            return false;
        }

        return this.verifyWithKey(envelope, sender.publicKeyArmored);
    }

    /**
     * Verify signature with a specific public key
     */
    private async verifyWithKey(envelope: MessageEnvelope, publicKeyArmored: string): Promise<boolean> {
        try {
            const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });

            const toVerify = JSON.stringify({
                version: envelope.version,
                type: envelope.type,
                fromFingerprint: envelope.fromFingerprint,
                toFingerprint: envelope.toFingerprint,
                timestamp: envelope.timestamp,
                payload: envelope.payload
            });

            const message = await openpgp.createMessage({ text: toVerify });
            const signature = await openpgp.readSignature({ armoredSignature: envelope.signature });

            const verified = await openpgp.verify({
                message,
                signature,
                verificationKeys: publicKey
            });

            const valid = await verified.signatures[0]?.verified;
            return valid === true;

        } catch {
            return false;
        }
    }

    /**
     * Validate envelope structure
     */
    private validateEnvelopeStructure(envelope: MessageEnvelope): void {
        if (envelope.version !== 1) {
            throw new Error(`Unsupported message version: ${envelope.version}`);
        }

        if (!envelope.type || !Object.values(MessageType).includes(envelope.type)) {
            throw new Error(`Invalid message type: ${envelope.type}`);
        }

        if (!envelope.fromFingerprint) {
            throw new Error("Missing fromFingerprint");
        }

        if (!envelope.timestamp) {
            throw new Error("Missing timestamp");
        }

        if (!envelope.payload) {
            throw new Error("Missing payload");
        }

        if (!envelope.signature) {
            throw new Error("Missing signature");
        }
    }

    /**
     * Validate message timestamp is within acceptable drift
     */
    private validateTimestamp(timestamp: number): void {
        const now = timestampNow();
        const drift = Math.abs(now - timestamp);

        if (drift > this.config.maxTimestampDrift) {
            throw new Error(`Message timestamp too far from current time (drift: ${drift}s)`);
        }
    }

    /**
     * Emit typed event based on message type
     */
    private emitTypedEvent(
        type: MessageType,
        payload: unknown,
        envelope: MessageEnvelope,
        stream: SAMStream
    ): void {
        switch (type) {
            case MessageType.PEER_ANNOUNCE:
                this.emit("peer_announce", payload as PeerAnnounce, stream);
                break;
            case MessageType.PEER_DISCOVER:
                this.emit("peer_discover", payload as PeerDiscover, stream);
                break;
            case MessageType.VOUCH_CREATE:
                this.emit("vouch_create", payload, stream);
                break;
            case MessageType.VOUCH_REVOKE:
                this.emit("vouch_revoke", payload, stream);
                break;
            case MessageType.GAME_LIST:
                this.emit("game_list", payload as GameListing, envelope, stream);
                break;
            case MessageType.GAME_DELIST:
                this.emit("game_delist", payload as GameDelistPayload, envelope, stream);
                break;
            case MessageType.RSVP_REQUEST:
                this.emit("rsvp_request", payload as SignedRSVPPayload, envelope, stream);
                break;
            case MessageType.RSVP_RESPONSE:
                this.emit("rsvp_response", payload as SignedRSVPPayload, envelope, stream);
                break;
            case MessageType.DIRECT_MESSAGE:
                this.emit("direct_message", payload, stream);
                break;
            default:
                // Unknown type - already validated, so this shouldn't happen
                break;
        }
    }
}
