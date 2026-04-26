/**
 * Peer Manager - Manages peer connections and discovery
 *
 * Handles:
 * - Peer connection management
 * - Peer discovery protocol
 * - Peer list exchange
 * - Bootstrap peers
 */

import { EventEmitter } from "events";
import { I2PManager } from "./i2p.js";
import { SAMStream } from "./stream-connection.js";
import { MessageHandler } from "./message-handler.js";
import { PlayerRepository } from "../storage/repositories/players.js";
import { PeerAnnounce, PeerDiscover, MessageType } from "../types/message.js";
import { PeerConnection, BootstrapPeer } from "./types.js";
import { timestampNow } from "../crypto/utils.js";

export interface PeerManagerEvents {
    peerDiscovered: (fingerprint: string, destination: string) => void;
    peerConnected: (fingerprint: string, stream: SAMStream) => void;
    peerDisconnected: (fingerprint: string) => void;
    error: (err: Error) => void;
}

export interface PeerManagerConfig {
    maxConnections: number;
    discoveryInterval: number;    // ms between discovery attempts
    connectionTimeout: number;    // ms to wait for connection
    maxPeersPerRequest: number;
}

const DEFAULT_CONFIG: PeerManagerConfig = {
    maxConnections: 50,
    discoveryInterval: 60000,     // 1 minute
    connectionTimeout: 30000,     // 30 seconds
    maxPeersPerRequest: 20
};

export class PeerManager extends EventEmitter {
    private i2pManager: I2PManager;
    private messageHandler: MessageHandler;
    private playerRepo: PlayerRepository;
    private localFingerprint: string;
    private localPublicKey: string;
    private config: PeerManagerConfig;

    private connections: Map<string, PeerConnection> = new Map();
    private streams: Map<string, SAMStream> = new Map();
    private pendingConnections: Set<string> = new Set();
    private discoveryTimer: ReturnType<typeof setInterval> | null = null;

    constructor(
        i2pManager: I2PManager,
        messageHandler: MessageHandler,
        playerRepo: PlayerRepository,
        localFingerprint: string,
        localPublicKey: string,
        config: Partial<PeerManagerConfig> = {}
    ) {
        super();
        this.i2pManager = i2pManager;
        this.messageHandler = messageHandler;
        this.playerRepo = playerRepo;
        this.localFingerprint = localFingerprint;
        this.localPublicKey = localPublicKey;
        this.config = { ...DEFAULT_CONFIG, ...config };

        this.setupMessageHandlers();
        this.setupI2PHandlers();
    }

    /**
     * Start the peer manager
     */
    start(): void {
        // Start periodic discovery
        this.discoveryTimer = setInterval(() => {
            this.discoverPeers();
        }, this.config.discoveryInterval);
    }

    /**
     * Stop the peer manager
     */
    stop(): void {
        if (this.discoveryTimer) {
            clearInterval(this.discoveryTimer);
            this.discoveryTimer = null;
        }

        // Close all connections
        for (const [fingerprint, stream] of this.streams) {
            stream.close();
            this.streams.delete(fingerprint);
            this.connections.delete(fingerprint);
        }
    }

    /**
     * Connect to a peer by their I2P destination
     */
    async connectToPeer(destination: string, fingerprint?: string): Promise<SAMStream> {
        // Check if already connected
        if (fingerprint && this.streams.has(fingerprint)) {
            return this.streams.get(fingerprint)!;
        }

        // Check connection limit
        if (this.connections.size >= this.config.maxConnections) {
            throw new Error("Maximum connections reached");
        }

        // Mark as pending
        const pendingKey = fingerprint || destination;
        if (this.pendingConnections.has(pendingKey)) {
            throw new Error("Connection already in progress");
        }
        this.pendingConnections.add(pendingKey);

        try {
            const stream = await this.i2pManager.connectToPeer(destination);

            // Send our announcement
            await this.announceToStream(stream);

            // If we don't have the fingerprint, we'll get it from their announcement
            if (fingerprint) {
                this.registerConnection(fingerprint, destination, stream);
            }

            return stream;

        } finally {
            this.pendingConnections.delete(pendingKey);
        }
    }

    /**
     * Connect to a peer by their GPG fingerprint
     */
    async connectByFingerprint(fingerprint: string): Promise<SAMStream> {
        // Check if already connected
        if (this.streams.has(fingerprint)) {
            return this.streams.get(fingerprint)!;
        }

        // Look up the peer's I2P destination
        const player = this.playerRepo.getByFingerprint(fingerprint);
        if (!player) {
            throw new Error(`Unknown peer: ${fingerprint}`);
        }

        if (!player.i2pDestination) {
            throw new Error(`No I2P destination for peer: ${fingerprint}`);
        }

        return this.connectToPeer(player.i2pDestination, fingerprint);
    }

    /**
     * Bootstrap from seed peers
     */
    async bootstrap(seeds: BootstrapPeer[]): Promise<void> {
        const promises = seeds.map(async (seed) => {
            try {
                await this.connectToPeer(seed.destination);
                console.log(`Connected to bootstrap peer: ${seed.name || seed.destination.substring(0, 20)}...`);
            } catch (err) {
                console.error(`Failed to connect to bootstrap peer: ${err}`);
            }
        });

        await Promise.all(promises);
    }

    /**
     * Announce our presence on a stream
     */
    async announceToStream(stream: SAMStream): Promise<void> {
        const destination = this.i2pManager.getDestination();
        if (!destination) {
            throw new Error("No I2P destination available");
        }

        // Get our profile
        const localPlayer = this.playerRepo.getByFingerprint(this.localFingerprint);
        const profileJson = localPlayer?.profileJson;

        const envelope = await this.messageHandler.createPeerAnnounce(
            destination.base64,
            this.localPublicKey,
            profileJson
        );

        await this.messageHandler.sendMessage(stream, envelope);
    }

    /**
     * Request peer list from a peer
     */
    async requestPeerList(stream: SAMStream): Promise<void> {
        const envelope = await this.messageHandler.createPeerDiscover(
            this.config.maxPeersPerRequest
        );

        await this.messageHandler.sendMessage(stream, envelope);
    }

    /**
     * Discover peers by requesting peer lists from connected peers
     */
    async discoverPeers(): Promise<void> {
        for (const stream of this.streams.values()) {
            try {
                await this.requestPeerList(stream);
            } catch (err) {
                // Ignore individual failures
            }
        }
    }

    /**
     * Get all connected peers
     */
    getConnectedPeers(): PeerConnection[] {
        return Array.from(this.connections.values());
    }

    /**
     * Get connection count
     */
    getConnectionCount(): number {
        return this.connections.size;
    }

    /**
     * Check if connected to a peer
     */
    isConnected(fingerprint: string): boolean {
        return this.streams.has(fingerprint);
    }

    /**
     * Get the SAMStream for a connected peer, if any
     */
    getStream(fingerprint: string): SAMStream | null {
        return this.streams.get(fingerprint) || null;
    }

    /**
     * Get all currently-open peer streams
     */
    getAllStreams(): SAMStream[] {
        return Array.from(this.streams.values());
    }

    /**
     * Disconnect from a peer
     */
    disconnect(fingerprint: string): void {
        const stream = this.streams.get(fingerprint);
        if (stream) {
            stream.close();
        }
        this.streams.delete(fingerprint);
        this.connections.delete(fingerprint);
        this.emit("peerDisconnected", fingerprint);
    }

    /**
     * Setup message handlers
     */
    private setupMessageHandlers(): void {
        this.messageHandler.on("peer_announce", (announce: PeerAnnounce, stream: SAMStream) => {
            this.handlePeerAnnounce(announce, stream);
        });

        this.messageHandler.on("peer_discover", (request: PeerDiscover, stream: SAMStream) => {
            this.handlePeerDiscover(request, stream);
        });
    }

    /**
     * Setup I2P manager handlers
     */
    private setupI2PHandlers(): void {
        this.i2pManager.on("connection", (stream: SAMStream) => {
            this.handleIncomingConnection(stream);
        });
    }

    /**
     * Handle incoming connection
     */
    private handleIncomingConnection(stream: SAMStream): void {
        // Attach message handler
        this.messageHandler.attachToStream(stream);

        // The peer should send their announcement
        // We'll register them when we receive it

        // Also send our announcement
        this.announceToStream(stream).catch(err => {
            console.error("Failed to announce on incoming connection:", err);
        });

        stream.on("close", () => {
            // Find and remove this connection
            for (const [fingerprint, s] of this.streams) {
                if (s === stream) {
                    this.streams.delete(fingerprint);
                    this.connections.delete(fingerprint);
                    this.emit("peerDisconnected", fingerprint);
                    break;
                }
            }
        });
    }

    /**
     * Handle peer announce message
     */
    private handlePeerAnnounce(announce: PeerAnnounce, stream: SAMStream): void {
        const { gpgFingerprint, i2pDestination, publicKeyArmored, profileJson } = announce;

        // Store or update the peer
        let player = this.playerRepo.getByFingerprint(gpgFingerprint);

        if (!player) {
            // New peer
            this.playerRepo.create({
                gpgFingerprint,
                i2pDestination,
                publicKeyArmored,
                profileJson,
                trustStatus: "untrusted"
            });
        } else {
            // Update existing peer
            if (i2pDestination) {
                this.playerRepo.updateI2pDestination(gpgFingerprint, i2pDestination);
            }
            if (profileJson) {
                this.playerRepo.updateProfile(gpgFingerprint, profileJson);
            }
            this.playerRepo.updateLastSeen(gpgFingerprint);
        }

        // Register the connection
        this.registerConnection(gpgFingerprint, i2pDestination, stream);

        this.emit("peerDiscovered", gpgFingerprint, i2pDestination);
    }

    /**
     * Handle peer discover request
     */
    private async handlePeerDiscover(request: PeerDiscover, stream: SAMStream): Promise<void> {
        const maxPeers = request.maxPeers || this.config.maxPeersPerRequest;

        // Get trusted peers to share
        const peers = this.playerRepo.getByTrustStatus("trusted")
            .slice(0, maxPeers)
            .filter(p => p.i2pDestination && p.gpgFingerprint !== request.requestingFingerprint);

        // Send announcements for each peer
        for (const peer of peers) {
            const announce: PeerAnnounce = {
                gpgFingerprint: peer.gpgFingerprint,
                i2pDestination: peer.i2pDestination!,
                publicKeyArmored: peer.publicKeyArmored,
                profileJson: peer.profileJson
            };

            const envelope = await this.messageHandler.createEnvelope(
                MessageType.PEER_ANNOUNCE,
                announce
            );

            await this.messageHandler.sendMessage(stream, envelope);
        }
    }

    /**
     * Register a connection
     */
    private registerConnection(fingerprint: string, destination: string, stream: SAMStream): void {
        // Don't re-register if already connected
        if (this.streams.has(fingerprint)) {
            return;
        }

        const now = timestampNow();

        this.connections.set(fingerprint, {
            fingerprint,
            destination,
            connectedAt: now,
            lastActivity: now
        });

        this.streams.set(fingerprint, stream);

        // Attach message handler if not already attached
        this.messageHandler.attachToStream(stream);

        stream.on("close", () => {
            this.streams.delete(fingerprint);
            this.connections.delete(fingerprint);
            this.emit("peerDisconnected", fingerprint);
        });

        stream.on("message", () => {
            // Update last activity
            const conn = this.connections.get(fingerprint);
            if (conn) {
                conn.lastActivity = timestampNow();
            }
        });

        this.emit("peerConnected", fingerprint, stream);
    }
}
