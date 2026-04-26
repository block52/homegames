/**
 * Network-specific TypeScript interfaces for I2P/SAM communication
 */

import { EventEmitter } from "events";

// SAM Protocol Types

export interface SAMConfig {
    host: string;
    port: number;
    sessionName: string;
}

export const DEFAULT_SAM_CONFIG: SAMConfig = {
    host: "127.0.0.1",
    port: 7656,
    sessionName: "homegames"
};

export enum SAMSessionStyle {
    STREAM = "STREAM",
    DATAGRAM = "DATAGRAM",
    RAW = "RAW"
}

export interface SAMSession {
    id: string;
    style: SAMSessionStyle;
    destination: string;
    privateKey: string;
}

export enum SAMResult {
    OK = "OK",
    CANT_REACH_PEER = "CANT_REACH_PEER",
    DUPLICATED_ID = "DUPLICATED_ID",
    DUPLICATED_DEST = "DUPLICATED_DEST",
    I2P_ERROR = "I2P_ERROR",
    INVALID_KEY = "INVALID_KEY",
    INVALID_ID = "INVALID_ID",
    KEY_NOT_FOUND = "KEY_NOT_FOUND",
    PEER_NOT_FOUND = "PEER_NOT_FOUND",
    TIMEOUT = "TIMEOUT"
}

export interface SAMResponse {
    command: string;
    result: SAMResult;
    pairs: Map<string, string>;
    message?: string;
}

export interface SAMDestination {
    publicKey: string;   // Base64 public destination (516+ chars)
    privateKey: string;  // Base64 private key (884+ chars)
    base32?: string;     // .b32.i2p address
}

// I2P Manager Types

export interface I2PConfig {
    samHost: string;
    samPort: number;
    sessionName: string;
    signatureType: number;
    inboundLength: number;
    outboundLength: number;
    inboundQuantity: number;
    outboundQuantity: number;
    reconnectDelay: number;
    maxReconnectAttempts: number;
}

export const DEFAULT_I2P_CONFIG: I2PConfig = {
    samHost: "127.0.0.1",
    samPort: 7656,
    sessionName: "homegames",
    signatureType: 7,           // EdDSA-SHA512-Ed25519
    inboundLength: 3,           // Tunnel hops
    outboundLength: 3,
    inboundQuantity: 2,         // Backup tunnels
    outboundQuantity: 2,
    reconnectDelay: 5000,       // ms
    maxReconnectAttempts: 10
};

export interface I2PDestination {
    base64: string;             // Public destination
    base32: string;             // .b32.i2p address
}

export interface I2PDestinationWithKeys extends I2PDestination {
    privateKey: string;         // Base64 private key
}

// Stream Connection Types

export interface StreamConnectionEvents {
    data: (data: Buffer) => void;
    close: () => void;
    error: (err: Error) => void;
}

export interface SAMStreamOptions {
    silent?: boolean;
    fromPort?: number;
    toPort?: number;
}

// Peer Manager Types

export interface PeerConnection {
    fingerprint: string;
    destination: string;
    connectedAt: number;
    lastActivity: number;
}

export interface BootstrapPeer {
    destination: string;
    name?: string;
}

// Network Service Types

export enum NetworkStatus {
    DISCONNECTED = "disconnected",
    CONNECTING = "connecting",
    CONNECTED = "connected",
    ERROR = "error"
}

export interface NetworkServiceEvents {
    status: (status: NetworkStatus) => void;
    ready: () => void;
    error: (err: Error) => void;
    peerDiscovered: (fingerprint: string, destination: string) => void;
    peerConnected: (fingerprint: string) => void;
    peerDisconnected: (fingerprint: string) => void;
    message: (type: string, payload: unknown, from: string) => void;
}

// Message framing

export const MESSAGE_HEADER_SIZE = 4; // 4 bytes for length prefix (big-endian uint32)
export const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB max message size

// SAM Protocol Constants

export const SAM_VERSION_MIN = "3.1";
export const SAM_VERSION_MAX = "3.3";
export const SAM_DEFAULT_SIGNATURE_TYPE = 7; // EdDSA-SHA512-Ed25519
