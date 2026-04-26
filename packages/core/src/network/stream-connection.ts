/**
 * SAMStream - Wrapper for I2P stream connections
 *
 * Provides a higher-level interface for sending and receiving
 * length-prefixed messages over I2P streams.
 */

import { EventEmitter } from "events";
import * as net from "net";
import { MESSAGE_HEADER_SIZE, MAX_MESSAGE_SIZE } from "./types.js";

export interface SAMStreamEvents {
    data: (data: Buffer) => void;
    message: (message: Buffer) => void;
    close: () => void;
    error: (err: Error) => void;
}

export class SAMStream extends EventEmitter {
    private socket: net.Socket;
    private _remoteDestination: string;
    private _localDestination: string;
    private closed = false;

    // Message framing state
    private receiveBuffer: Buffer = Buffer.alloc(0);
    private expectedLength: number | null = null;

    constructor(socket: net.Socket, localDestination: string, remoteDestination: string) {
        super();
        this.socket = socket;
        this._localDestination = localDestination;
        this._remoteDestination = remoteDestination;

        this.setupSocketHandlers();
    }

    get remoteDestination(): string {
        return this._remoteDestination;
    }

    get localDestination(): string {
        return this._localDestination;
    }

    get isClosed(): boolean {
        return this.closed;
    }

    /**
     * Write raw bytes to the stream
     */
    async writeRaw(data: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.closed) {
                reject(new Error("Stream is closed"));
                return;
            }

            this.socket.write(data, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Write a length-prefixed message to the stream
     */
    async writeMessage(data: Buffer): Promise<void> {
        if (data.length > MAX_MESSAGE_SIZE) {
            throw new Error(`Message too large: ${data.length} > ${MAX_MESSAGE_SIZE}`);
        }

        // Create length prefix (4 bytes, big-endian)
        const header = Buffer.alloc(MESSAGE_HEADER_SIZE);
        header.writeUInt32BE(data.length, 0);

        // Write header + data
        const frame = Buffer.concat([header, data]);
        return this.writeRaw(frame);
    }

    /**
     * Write a JSON object as a message
     */
    async writeJSON(obj: unknown): Promise<void> {
        const json = JSON.stringify(obj);
        const data = Buffer.from(json, "utf-8");
        return this.writeMessage(data);
    }

    /**
     * Close the stream
     */
    close(): void {
        if (this.closed) return;

        this.closed = true;
        this.socket.destroy();
        this.emit("close");
    }

    /**
     * Setup socket event handlers
     */
    private setupSocketHandlers(): void {
        this.socket.on("data", (data: Buffer) => {
            // Emit raw data event
            this.emit("data", data);

            // Process for message framing
            this.processIncomingData(data);
        });

        this.socket.on("close", () => {
            this.closed = true;
            this.emit("close");
        });

        this.socket.on("error", (err: Error) => {
            this.emit("error", err);
        });

        this.socket.on("end", () => {
            this.closed = true;
            this.emit("close");
        });
    }

    /**
     * Process incoming data for length-prefixed message framing
     */
    private processIncomingData(data: Buffer): void {
        // Append to receive buffer
        this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);

        // Process complete messages
        while (this.receiveBuffer.length > 0) {
            // Read length if we don't have it yet
            if (this.expectedLength === null) {
                if (this.receiveBuffer.length < MESSAGE_HEADER_SIZE) {
                    // Not enough data for header yet
                    break;
                }

                this.expectedLength = this.receiveBuffer.readUInt32BE(0);

                // Validate length
                if (this.expectedLength > MAX_MESSAGE_SIZE) {
                    this.emit("error", new Error(`Message too large: ${this.expectedLength}`));
                    this.close();
                    return;
                }

                // Remove header from buffer
                this.receiveBuffer = this.receiveBuffer.subarray(MESSAGE_HEADER_SIZE);
            }

            // Check if we have the complete message
            if (this.receiveBuffer.length < this.expectedLength) {
                // Not enough data yet
                break;
            }

            // Extract the message
            const message = this.receiveBuffer.subarray(0, this.expectedLength);
            this.receiveBuffer = this.receiveBuffer.subarray(this.expectedLength);
            this.expectedLength = null;

            // Emit the message
            this.emit("message", message);
        }
    }

    /**
     * Read the next complete message (Promise-based)
     */
    readMessage(): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            if (this.closed) {
                reject(new Error("Stream is closed"));
                return;
            }

            const onMessage = (message: Buffer) => {
                this.removeListener("close", onClose);
                this.removeListener("error", onError);
                resolve(message);
            };

            const onClose = () => {
                this.removeListener("message", onMessage);
                this.removeListener("error", onError);
                reject(new Error("Stream closed while waiting for message"));
            };

            const onError = (err: Error) => {
                this.removeListener("message", onMessage);
                this.removeListener("close", onClose);
                reject(err);
            };

            this.once("message", onMessage);
            this.once("close", onClose);
            this.once("error", onError);
        });
    }

    /**
     * Read the next message as JSON
     */
    async readJSON<T = unknown>(): Promise<T> {
        const message = await this.readMessage();
        const json = message.toString("utf-8");
        return JSON.parse(json) as T;
    }
}

/**
 * Create a SAMStream from an existing connection
 */
export function createStream(
    socket: net.Socket,
    localDestination: string,
    remoteDestination: string
): SAMStream {
    return new SAMStream(socket, localDestination, remoteDestination);
}
