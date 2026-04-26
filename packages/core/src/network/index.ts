// Types
export * from "./types.js";

// SAM Client
export { SAMClient, DEFAULT_SAM_CONFIG, SAMSessionStyle } from "./sam.js";
export type { SAMConfig, SAMSession } from "./sam.js";

// Stream Connection
export { SAMStream, createStream } from "./stream-connection.js";

// Destination Store
export { DestinationStore } from "./destination-store.js";

// I2P Manager
export { I2PManager, DEFAULT_I2P_CONFIG } from "./i2p.js";
export type { I2PConfig, I2PDestination } from "./i2p.js";

// Message Handler
export { MessageHandler } from "./message-handler.js";

// Peer Manager
export { PeerManager } from "./peer-manager.js";

// Network Service
export { NetworkService } from "./service.js";
