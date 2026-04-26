/**
 * I2P Network Manager
 *
 * High-level manager for I2P networking. Handles:
 * - SAM bridge connection
 * - Session lifecycle management
 * - Destination persistence
 * - Auto-reconnection
 * - Incoming connection handling
 */

import { EventEmitter } from "events";
import { SAMClient, SAMSessionStyle } from "./sam.js";
import { SAMStream, createStream } from "./stream-connection.js";
import { DestinationStore } from "./destination-store.js";
import {
    I2PConfig,
    DEFAULT_I2P_CONFIG,
    I2PDestination,
    I2PDestinationWithKeys,
    NetworkStatus,
    SAMSession
} from "./types.js";

export type { I2PConfig, I2PDestination };
export { DEFAULT_I2P_CONFIG };

export interface I2PManagerEvents {
    status: (status: NetworkStatus) => void;
    ready: () => void;
    connection: (stream: SAMStream) => void;
    error: (err: Error) => void;
    disconnected: () => void;
}

export class I2PManager extends EventEmitter {
    private config: I2PConfig;
    private destStore: DestinationStore;
    private samClient: SAMClient | null = null;
    private session: SAMSession | null = null;
    private destination: I2PDestinationWithKeys | null = null;
    private status: NetworkStatus = NetworkStatus.DISCONNECTED;
    private reconnectAttempts = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private acceptLoop: Promise<void> | null = null;
    private acceptLoopRunning = false;

    constructor(destStore: DestinationStore, config: Partial<I2PConfig> = {}) {
        super();
        this.config = { ...DEFAULT_I2P_CONFIG, ...config };
        this.destStore = destStore;
    }

    /**
     * Start the I2P manager - connect to SAM and create session
     */
    async start(): Promise<void> {
        if (this.status === NetworkStatus.CONNECTED) {
            return;
        }

        this.setStatus(NetworkStatus.CONNECTING);

        try {
            // Create SAM client
            this.samClient = new SAMClient({
                host: this.config.samHost,
                port: this.config.samPort,
                sessionName: this.config.sessionName
            });

            // Setup SAM client event handlers
            this.samClient.on("disconnected", () => this.handleDisconnect());
            this.samClient.on("error", (err) => this.emit("error", err));

            // Connect to SAM bridge
            const version = await this.samClient.connect();
            console.log(`Connected to SAM bridge v${version}`);

            // Get or create destination
            this.destination = await this.getOrCreateDestination();

            // Create session with our destination
            this.session = await this.samClient.createSession(
                SAMSessionStyle.STREAM,
                this.destination.privateKey,
                {
                    "inbound.length": this.config.inboundLength,
                    "outbound.length": this.config.outboundLength,
                    "inbound.quantity": this.config.inboundQuantity,
                    "outbound.quantity": this.config.outboundQuantity
                }
            );

            this.setStatus(NetworkStatus.CONNECTED);
            this.reconnectAttempts = 0;
            this.emit("ready");

            // Start accepting incoming connections
            this.startAcceptLoop();

        } catch (err) {
            this.setStatus(NetworkStatus.ERROR);
            this.emit("error", err as Error);

            // Schedule reconnect
            this.scheduleReconnect();

            throw err;
        }
    }

    /**
     * Stop the I2P manager
     */
    async stop(): Promise<void> {
        this.acceptLoopRunning = false;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.samClient) {
            this.samClient.disconnect();
            this.samClient = null;
        }

        this.session = null;
        this.setStatus(NetworkStatus.DISCONNECTED);
    }

    /**
     * Connect to a peer by their I2P destination
     */
    async connectToPeer(destination: string): Promise<SAMStream> {
        if (!this.samClient || !this.session || !this.destination) {
            throw new Error("I2P manager not started");
        }

        const socket = await this.samClient.streamConnect(this.session.id, destination);
        return createStream(socket, this.destination.base64, destination);
    }

    /**
     * Get or create our I2P destination
     */
    private async getOrCreateDestination(): Promise<I2PDestinationWithKeys> {
        // Try to load existing destination
        const stored = this.destStore.load();
        if (stored) {
            console.log(`Using stored I2P destination: ${stored.base32}`);
            return stored;
        }

        // Generate new destination
        if (!this.samClient) {
            throw new Error("SAM client not connected");
        }

        console.log("Generating new I2P destination...");
        const dest = await this.samClient.generateDestination(this.config.signatureType);

        const destWithKeys: I2PDestinationWithKeys = {
            base64: dest.publicKey,
            privateKey: dest.privateKey,
            base32: dest.base32 || this.computeBase32(dest.publicKey)
        };

        // Save for future use
        this.destStore.save(destWithKeys);
        console.log(`Generated new I2P destination: ${destWithKeys.base32}`);

        return destWithKeys;
    }

    /**
     * Compute base32 address from public destination
     * Note: This is a placeholder - proper implementation requires SHA-256
     */
    private computeBase32(publicKey: string): string {
        // Simplified version - real implementation would use crypto
        return `${publicKey.substring(0, 52).toLowerCase()}.b32.i2p`;
    }

    /**
     * Start the accept loop for incoming connections
     */
    private startAcceptLoop(): void {
        if (this.acceptLoopRunning) return;

        this.acceptLoopRunning = true;
        this.acceptLoop = this.runAcceptLoop();
    }

    /**
     * Accept loop - continuously accept incoming connections
     */
    private async runAcceptLoop(): Promise<void> {
        while (this.acceptLoopRunning && this.samClient && this.session) {
            try {
                const { socket, remoteDestination } = await this.samClient.streamAccept(this.session.id);

                if (!this.destination) continue;

                const stream = createStream(socket, this.destination.base64, remoteDestination);
                this.emit("connection", stream);

            } catch (err) {
                if (this.acceptLoopRunning) {
                    // Only log if we're still supposed to be running
                    console.error("Accept loop error:", err);

                    // Small delay before retrying
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
    }

    /**
     * Handle disconnection from SAM bridge
     */
    private handleDisconnect(): void {
        this.session = null;
        this.acceptLoopRunning = false;
        this.setStatus(NetworkStatus.DISCONNECTED);
        this.emit("disconnected");

        // Attempt reconnection
        this.scheduleReconnect();
    }

    /**
     * Schedule a reconnection attempt
     */
    private scheduleReconnect(): void {
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            console.error(`Max reconnect attempts (${this.config.maxReconnectAttempts}) reached`);
            return;
        }

        const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;

        console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

        this.reconnectTimer = setTimeout(async () => {
            try {
                await this.start();
            } catch (err) {
                // Error will be handled by start()
            }
        }, delay);
    }

    /**
     * Update and emit status
     */
    private setStatus(status: NetworkStatus): void {
        this.status = status;
        this.emit("status", status);
    }

    /**
     * Get current connection status
     */
    getStatus(): NetworkStatus {
        return this.status;
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.status === NetworkStatus.CONNECTED;
    }

    /**
     * Get our I2P destination
     */
    getDestination(): I2PDestination | null {
        if (!this.destination) return null;
        return {
            base64: this.destination.base64,
            base32: this.destination.base32
        };
    }

    /**
     * Get the session ID
     */
    getSessionId(): string | null {
        return this.session?.id || null;
    }

    /**
     * Get the current configuration
     */
    getConfig(): I2PConfig {
        return { ...this.config };
    }

    /**
     * Regenerate destination (creates new I2P identity)
     */
    async regenerateDestination(): Promise<I2PDestination> {
        const wasRunning = this.isConnected();

        if (wasRunning) {
            await this.stop();
        }

        // Clear stored destination
        this.destStore.clear();
        this.destination = null;

        if (wasRunning) {
            await this.start();
        }

        const dest = this.destination as I2PDestinationWithKeys | null;
        if (!dest) {
            throw new Error("Failed to regenerate destination");
        }

        return {
            base64: dest.base64,
            base32: dest.base32
        };
    }
}
