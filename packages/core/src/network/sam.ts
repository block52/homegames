/**
 * SAM V3 Bridge Client
 *
 * Implements the SAM (Simple Anonymous Messaging) protocol for communicating
 * with I2P routers. SAM allows applications to use I2P without implementing
 * the full I2P stack.
 *
 * Protocol docs: https://i2p.net/en/docs/api/samv3
 */

import { EventEmitter } from "events";
import * as net from "net";
import {
    SAMConfig,
    DEFAULT_SAM_CONFIG,
    SAMSession,
    SAMSessionStyle,
    SAMResult,
    SAMResponse,
    SAMDestination,
    SAM_VERSION_MIN,
    SAM_VERSION_MAX,
    SAM_DEFAULT_SIGNATURE_TYPE
} from "./types.js";

export type { SAMConfig, SAMSession };
export { DEFAULT_SAM_CONFIG, SAMSessionStyle };

interface SAMClientEvents {
    connected: () => void;
    disconnected: () => void;
    error: (err: Error) => void;
}

export class SAMClient extends EventEmitter {
    private config: SAMConfig;
    private socket: net.Socket | null = null;
    private connected = false;
    private version: string | null = null;
    private responseBuffer = "";
    private pendingResolve: ((response: SAMResponse) => void) | null = null;
    private pendingReject: ((err: Error) => void) | null = null;

    constructor(config: Partial<SAMConfig> = {}) {
        super();
        this.config = { ...DEFAULT_SAM_CONFIG, ...config };
    }

    /**
     * Connect to SAM bridge and perform handshake
     */
    async connect(): Promise<string> {
        if (this.connected) {
            return this.version!;
        }

        return new Promise((resolve, reject) => {
            this.socket = new net.Socket();

            this.socket.on("connect", async () => {
                try {
                    const version = await this.handshake();
                    this.connected = true;
                    this.version = version;
                    this.emit("connected");
                    resolve(version);
                } catch (err) {
                    this.disconnect();
                    reject(err);
                }
            });

            this.socket.on("data", (data: Buffer) => {
                this.handleData(data);
            });

            this.socket.on("error", (err: Error) => {
                this.emit("error", err);
                if (this.pendingReject) {
                    this.pendingReject(err);
                    this.pendingResolve = null;
                    this.pendingReject = null;
                }
            });

            this.socket.on("close", () => {
                this.connected = false;
                this.version = null;
                this.emit("disconnected");
            });

            this.socket.connect(this.config.port, this.config.host);
        });
    }

    /**
     * Disconnect from SAM bridge
     */
    disconnect(): void {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        this.connected = false;
        this.version = null;
    }

    /**
     * Perform HELLO handshake with SAM bridge
     */
    private async handshake(): Promise<string> {
        const command = `HELLO VERSION MIN=${SAM_VERSION_MIN} MAX=${SAM_VERSION_MAX}\n`;
        const response = await this.sendCommand(command);

        if (response.result !== SAMResult.OK) {
            throw new Error(`SAM handshake failed: ${response.message || response.result}`);
        }

        const version = response.pairs.get("VERSION");
        if (!version) {
            throw new Error("SAM handshake: no version in response");
        }

        return version;
    }

    /**
     * Generate a new I2P destination keypair
     */
    async generateDestination(signatureType: number = SAM_DEFAULT_SIGNATURE_TYPE): Promise<SAMDestination> {
        this.ensureConnected();

        const command = `DEST GENERATE SIGNATURE_TYPE=${signatureType}\n`;
        const response = await this.sendCommand(command);

        const pub = response.pairs.get("PUB");
        const priv = response.pairs.get("PRIV");

        if (!pub || !priv) {
            throw new Error("DEST GENERATE: missing PUB or PRIV in response");
        }

        return {
            publicKey: pub,
            privateKey: priv,
            base32: this.destToBase32(pub)
        };
    }

    /**
     * Create a new SAM session
     */
    async createSession(
        style: SAMSessionStyle = SAMSessionStyle.STREAM,
        destination?: string,
        options: Record<string, string | number> = {}
    ): Promise<SAMSession> {
        this.ensureConnected();

        const dest = destination || "TRANSIENT";
        const id = this.config.sessionName;

        let command = `SESSION CREATE STYLE=${style} ID=${id} DESTINATION=${dest}`;

        // Add signature type for transient destinations
        if (dest === "TRANSIENT" && !options.SIGNATURE_TYPE) {
            command += ` SIGNATURE_TYPE=${SAM_DEFAULT_SIGNATURE_TYPE}`;
        }

        // Add additional options
        for (const [key, value] of Object.entries(options)) {
            command += ` ${key}=${value}`;
        }

        command += "\n";

        const response = await this.sendCommand(command);

        if (response.result !== SAMResult.OK) {
            throw new Error(`SESSION CREATE failed: ${response.message || response.result}`);
        }

        const sessionDest = response.pairs.get("DESTINATION");
        if (!sessionDest) {
            throw new Error("SESSION CREATE: no DESTINATION in response");
        }

        return {
            id,
            style,
            destination: this.extractPublicDest(sessionDest),
            privateKey: sessionDest
        };
    }

    /**
     * Look up an I2P name/address
     */
    async lookupName(name: string): Promise<string> {
        this.ensureConnected();

        const command = `NAMING LOOKUP NAME=${name}\n`;
        const response = await this.sendCommand(command);

        if (response.result !== SAMResult.OK) {
            throw new Error(`NAMING LOOKUP failed: ${response.message || response.result}`);
        }

        const value = response.pairs.get("VALUE");
        if (!value) {
            throw new Error("NAMING LOOKUP: no VALUE in response");
        }

        return value;
    }

    /**
     * Connect to a remote destination (STREAM style)
     * Returns the raw socket for stream communication
     */
    async streamConnect(
        sessionId: string,
        destination: string,
        options: { silent?: boolean; fromPort?: number; toPort?: number } = {}
    ): Promise<net.Socket> {
        // Create a new socket for the stream connection
        const streamSocket = new net.Socket();

        return new Promise((resolve, reject) => {
            streamSocket.on("connect", async () => {
                try {
                    let command = `STREAM CONNECT ID=${sessionId} DESTINATION=${destination}`;

                    if (options.silent !== undefined) {
                        command += ` SILENT=${options.silent}`;
                    }
                    if (options.fromPort !== undefined) {
                        command += ` FROM_PORT=${options.fromPort}`;
                    }
                    if (options.toPort !== undefined) {
                        command += ` TO_PORT=${options.toPort}`;
                    }

                    command += "\n";

                    // Send command and wait for response
                    const response = await this.sendCommandOnSocket(streamSocket, command);

                    if (response.result !== SAMResult.OK) {
                        streamSocket.destroy();
                        reject(new Error(`STREAM CONNECT failed: ${response.message || response.result}`));
                        return;
                    }

                    // Connection established - socket is now a raw stream to the peer
                    resolve(streamSocket);
                } catch (err) {
                    streamSocket.destroy();
                    reject(err);
                }
            });

            streamSocket.on("error", (err) => {
                reject(err);
            });

            streamSocket.connect(this.config.port, this.config.host);
        });
    }

    /**
     * Accept an incoming connection (STREAM style)
     * Returns the raw socket and remote destination
     */
    async streamAccept(
        sessionId: string,
        options: { silent?: boolean } = {}
    ): Promise<{ socket: net.Socket; remoteDestination: string }> {
        // Create a new socket for accepting
        const acceptSocket = new net.Socket();

        return new Promise((resolve, reject) => {
            acceptSocket.on("connect", async () => {
                try {
                    let command = `STREAM ACCEPT ID=${sessionId}`;

                    if (options.silent !== undefined) {
                        command += ` SILENT=${options.silent}`;
                    }

                    command += "\n";

                    // Send command and wait for response
                    const response = await this.sendCommandOnSocket(acceptSocket, command);

                    if (response.result !== SAMResult.OK) {
                        acceptSocket.destroy();
                        reject(new Error(`STREAM ACCEPT failed: ${response.message || response.result}`));
                        return;
                    }

                    // Wait for incoming connection - next line will be the destination
                    const destLine = await this.readLineFromSocket(acceptSocket);
                    const remoteDestination = destLine.trim();

                    resolve({ socket: acceptSocket, remoteDestination });
                } catch (err) {
                    acceptSocket.destroy();
                    reject(err);
                }
            });

            acceptSocket.on("error", (err) => {
                reject(err);
            });

            acceptSocket.connect(this.config.port, this.config.host);
        });
    }

    /**
     * Send a command and wait for response
     */
    private sendCommand(command: string): Promise<SAMResponse> {
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                reject(new Error("Not connected to SAM bridge"));
                return;
            }

            this.pendingResolve = resolve;
            this.pendingReject = reject;

            this.socket.write(command);
        });
    }

    /**
     * Send a command on a specific socket and wait for response
     */
    private sendCommandOnSocket(socket: net.Socket, command: string): Promise<SAMResponse> {
        return new Promise((resolve, reject) => {
            let buffer = "";

            const onData = (data: Buffer) => {
                buffer += data.toString("utf-8");

                const newlineIndex = buffer.indexOf("\n");
                if (newlineIndex !== -1) {
                    socket.removeListener("data", onData);
                    const line = buffer.substring(0, newlineIndex);
                    const response = this.parseResponse(line);
                    resolve(response);
                }
            };

            socket.on("data", onData);
            socket.write(command);
        });
    }

    /**
     * Read a single line from a socket
     */
    private readLineFromSocket(socket: net.Socket): Promise<string> {
        return new Promise((resolve, reject) => {
            let buffer = "";

            const onData = (data: Buffer) => {
                buffer += data.toString("utf-8");

                const newlineIndex = buffer.indexOf("\n");
                if (newlineIndex !== -1) {
                    socket.removeListener("data", onData);
                    const line = buffer.substring(0, newlineIndex);
                    resolve(line);
                }
            };

            socket.on("data", onData);
        });
    }

    /**
     * Handle incoming data from the control socket
     */
    private handleData(data: Buffer): void {
        this.responseBuffer += data.toString("utf-8");

        const newlineIndex = this.responseBuffer.indexOf("\n");
        if (newlineIndex !== -1) {
            const line = this.responseBuffer.substring(0, newlineIndex);
            this.responseBuffer = this.responseBuffer.substring(newlineIndex + 1);

            const response = this.parseResponse(line);

            if (this.pendingResolve) {
                this.pendingResolve(response);
                this.pendingResolve = null;
                this.pendingReject = null;
            }
        }
    }

    /**
     * Parse a SAM response line into structured data
     */
    private parseResponse(line: string): SAMResponse {
        const pairs = new Map<string, string>();
        let result = SAMResult.OK;
        let message: string | undefined;

        // Tokenize respecting quoted values
        const tokens = this.tokenize(line);

        // First token is the command type (HELLO, SESSION, etc.)
        const command = tokens[0] || "";

        // Parse key=value pairs
        for (let i = 1; i < tokens.length; i++) {
            const token = tokens[i];
            const eqIndex = token.indexOf("=");

            if (eqIndex !== -1) {
                const key = token.substring(0, eqIndex);
                let value = token.substring(eqIndex + 1);

                // Remove quotes if present
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.substring(1, value.length - 1);
                }

                if (key === "RESULT") {
                    result = value as SAMResult;
                } else if (key === "MESSAGE") {
                    message = value;
                } else {
                    pairs.set(key, value);
                }
            }
        }

        return { command, result, pairs, message };
    }

    /**
     * Tokenize a SAM response line, respecting quoted values
     */
    private tokenize(line: string): string[] {
        const tokens: string[] = [];
        let current = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"' && (i === 0 || line[i - 1] !== "\\")) {
                inQuotes = !inQuotes;
                current += char;
            } else if (char === " " && !inQuotes) {
                if (current) {
                    tokens.push(current);
                    current = "";
                }
            } else {
                current += char;
            }
        }

        if (current) {
            tokens.push(current);
        }

        return tokens;
    }

    /**
     * Convert a destination to base32 address
     * This is a simplified version - full implementation requires SHA-256 hash
     */
    private destToBase32(destination: string): string {
        // The base32 address is derived from SHA-256 hash of the destination
        // For now, we'll mark this as needing calculation
        // Full implementation would use crypto.createHash('sha256')
        return `${destination.substring(0, 52).toLowerCase()}.b32.i2p`;
    }

    /**
     * Extract the public destination from a private key
     * The public part is the first 516+ characters before the private key data
     */
    private extractPublicDest(privateKey: string): string {
        // Public destination is typically 516 characters for EdDSA
        // This is a simplification - proper extraction depends on key type
        return privateKey.substring(0, 516);
    }

    /**
     * Ensure we're connected to the SAM bridge
     */
    private ensureConnected(): void {
        if (!this.connected || !this.socket) {
            throw new Error("Not connected to SAM bridge. Call connect() first.");
        }
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Get the negotiated SAM version
     */
    getVersion(): string | null {
        return this.version;
    }

    /**
     * Get the current configuration
     */
    getConfig(): SAMConfig {
        return { ...this.config };
    }
}
