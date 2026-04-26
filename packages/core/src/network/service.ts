/**
 * Network Service - Top-level facade for I2P networking
 *
 * Provides a simple API for CLI and UI to interact with the
 * P2P networking layer.
 */

import { EventEmitter } from "events";
import * as openpgp from "openpgp";
import { I2PManager } from "./i2p.js";
import { SAMStream } from "./stream-connection.js";
import { MessageHandler } from "./message-handler.js";
import { PeerManager } from "./peer-manager.js";
import { GameNetworkHandler } from "./game-handler.js";
import { DestinationStore } from "./destination-store.js";
import { NetworkStatus, I2PConfig, DEFAULT_I2P_CONFIG, BootstrapPeer } from "./types.js";
import { PlayerRepository } from "../storage/repositories/players.js";
import { GameRepository } from "../storage/repositories/games.js";
import { RSVPRepository } from "../storage/repositories/rsvps.js";
import { ConfigRepository } from "../storage/repositories/config.js";
import { GameService } from "../game/listing.js";
import { RSVPService } from "../game/rsvp.js";
import { Keyring } from "../crypto/keyring.js";
import { Player } from "../types/identity.js";
import type Database from "better-sqlite3";

export interface NetworkServiceEvents {
    status: (status: NetworkStatus) => void;
    ready: () => void;
    error: (err: Error) => void;
    peerDiscovered: (fingerprint: string, destination: string) => void;
    peerConnected: (fingerprint: string) => void;
    peerDisconnected: (fingerprint: string) => void;
}

export interface NetworkServiceConfig extends Partial<I2PConfig> {
    bootstrapPeers?: BootstrapPeer[];
}

export class NetworkService extends EventEmitter {
    private db: Database.Database;
    private playerRepo: PlayerRepository;
    private configRepo: ConfigRepository;
    private destStore: DestinationStore;

    private i2pManager: I2PManager | null = null;
    private messageHandler: MessageHandler | null = null;
    private peerManager: PeerManager | null = null;
    private gameNetworkHandler: GameNetworkHandler | null = null;

    private localFingerprint: string | null = null;
    private privateKey: openpgp.PrivateKey | null = null;
    private publicKeyArmored: string | null = null;

    private config: NetworkServiceConfig;

    constructor(db: Database.Database, config: NetworkServiceConfig = {}) {
        super();
        this.db = db;
        this.config = config;

        this.playerRepo = new PlayerRepository(db);
        this.configRepo = new ConfigRepository(db);
        this.destStore = new DestinationStore(this.configRepo);
    }

    /**
     * Initialize with identity
     */
    async initialize(
        fingerprint: string,
        privateKeyArmored: string,
        passphrase: string,
        publicKeyArmored: string
    ): Promise<void> {
        this.localFingerprint = fingerprint;
        this.publicKeyArmored = publicKeyArmored;

        // Decrypt private key
        const encryptedKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
        this.privateKey = await openpgp.decryptKey({
            privateKey: encryptedKey,
            passphrase
        });
    }

    /**
     * Start the network service
     */
    async start(): Promise<void> {
        if (!this.localFingerprint || !this.privateKey || !this.publicKeyArmored) {
            throw new Error("Network service not initialized. Call initialize() first.");
        }

        // Create I2P manager
        this.i2pManager = new I2PManager(this.destStore, this.config);

        // Forward I2P events
        this.i2pManager.on("status", (status) => this.emit("status", status));
        this.i2pManager.on("error", (err) => this.emit("error", err));

        // Create message handler
        this.messageHandler = new MessageHandler(
            this.localFingerprint,
            this.privateKey,
            this.playerRepo
        );

        // Start I2P
        await this.i2pManager.start();

        // Create peer manager
        this.peerManager = new PeerManager(
            this.i2pManager,
            this.messageHandler,
            this.playerRepo,
            this.localFingerprint,
            this.publicKeyArmored
        );

        // Forward peer events
        this.peerManager.on("peerDiscovered", (fp, dest) => this.emit("peerDiscovered", fp, dest));
        this.peerManager.on("peerConnected", (fp) => this.emit("peerConnected", fp));
        this.peerManager.on("peerDisconnected", (fp) => this.emit("peerDisconnected", fp));
        this.peerManager.on("error", (err) => this.emit("error", err));

        // Start peer manager
        this.peerManager.start();

        // Bootstrap if configured
        if (this.config.bootstrapPeers && this.config.bootstrapPeers.length > 0) {
            await this.peerManager.bootstrap(this.config.bootstrapPeers);
        }

        this.emit("ready");
    }

    /**
     * Stop the network service
     */
    async stop(): Promise<void> {
        if (this.peerManager) {
            this.peerManager.stop();
            this.peerManager = null;
        }

        if (this.i2pManager) {
            await this.i2pManager.stop();
            this.i2pManager = null;
        }

        this.messageHandler = null;
        this.gameNetworkHandler = null;
    }

    /**
     * Attach game-listing networking. Call after start() with the
     * GameService and RSVPService that share the same DB. The handler
     * subscribes to MessageHandler and PeerManager events; broadcast
     * methods become available immediately.
     */
    attachGameHandler(
        gameService: GameService,
        rsvpService: RSVPService,
        keyring: Keyring
    ): GameNetworkHandler {
        if (!this.messageHandler || !this.peerManager) {
            throw new Error("Network service not started. Call start() first.");
        }
        if (this.gameNetworkHandler) return this.gameNetworkHandler;

        const gameRepo = new GameRepository(this.db);
        const rsvpRepo = new RSVPRepository(this.db);

        this.gameNetworkHandler = new GameNetworkHandler(
            this.messageHandler,
            this.peerManager,
            gameService,
            rsvpService,
            gameRepo,
            rsvpRepo,
            keyring
        );
        return this.gameNetworkHandler;
    }

    getGameNetworkHandler(): GameNetworkHandler | null {
        return this.gameNetworkHandler;
    }

    /**
     * Get current status
     */
    getStatus(): NetworkStatus {
        return this.i2pManager?.getStatus() || NetworkStatus.DISCONNECTED;
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.i2pManager?.isConnected() || false;
    }

    /**
     * Get our I2P destination
     */
    getDestination(): { base64: string; base32: string } | null {
        return this.i2pManager?.getDestination() || null;
    }

    /**
     * Get connected peer count
     */
    getConnectedPeerCount(): number {
        return this.peerManager?.getConnectionCount() || 0;
    }

    /**
     * Get list of connected peers
     */
    getConnectedPeers(): Player[] {
        if (!this.peerManager) return [];

        const connections = this.peerManager.getConnectedPeers();
        const players: Player[] = [];

        for (const conn of connections) {
            const player = this.playerRepo.getByFingerprint(conn.fingerprint);
            if (player) {
                players.push(player);
            }
        }

        return players;
    }

    /**
     * Connect to a peer by fingerprint
     */
    async connectToPeer(fingerprint: string): Promise<void> {
        if (!this.peerManager) {
            throw new Error("Network service not started");
        }

        await this.peerManager.connectByFingerprint(fingerprint);
    }

    /**
     * Connect to a peer by I2P destination
     */
    async connectToDestination(destination: string): Promise<void> {
        if (!this.peerManager) {
            throw new Error("Network service not started");
        }

        await this.peerManager.connectToPeer(destination);
    }

    /**
     * Disconnect from a peer
     */
    disconnectPeer(fingerprint: string): void {
        this.peerManager?.disconnect(fingerprint);
    }

    /**
     * Announce our presence to all connected peers
     */
    async announce(): Promise<void> {
        if (!this.peerManager || !this.messageHandler || !this.i2pManager) {
            throw new Error("Network service not started");
        }

        const destination = this.i2pManager.getDestination();
        if (!destination || !this.publicKeyArmored) {
            throw new Error("No destination available");
        }

        const localPlayer = this.playerRepo.getByFingerprint(this.localFingerprint!);

        const envelope = await this.messageHandler.createPeerAnnounce(
            destination.base64,
            this.publicKeyArmored,
            localPlayer?.profileJson
        );

        const streams = this.peerManager.getConnectedPeers()
            .map(conn => {
                // Get stream for this connection
                const player = this.playerRepo.getByFingerprint(conn.fingerprint);
                return player?.i2pDestination;
            })
            .filter((dest): dest is string => !!dest);

        // This is a simplified version - in practice we'd need to get the actual streams
        console.log(`Would announce to ${streams.length} peers`);
    }

    /**
     * Discover peers
     */
    async discover(): Promise<Player[]> {
        if (!this.peerManager) {
            throw new Error("Network service not started");
        }

        await this.peerManager.discoverPeers();

        // Return currently known peers with I2P destinations
        return this.playerRepo.getAll().filter(p => p.i2pDestination);
    }

    /**
     * Bootstrap from seed peers
     */
    async bootstrap(peers: BootstrapPeer[]): Promise<void> {
        if (!this.peerManager) {
            throw new Error("Network service not started");
        }

        await this.peerManager.bootstrap(peers);
    }
}
