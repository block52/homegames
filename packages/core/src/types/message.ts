export enum MessageType {
    PEER_ANNOUNCE = "peer_announce",
    PEER_DISCOVER = "peer_discover",
    VOUCH_CREATE = "vouch_create",
    VOUCH_REVOKE = "vouch_revoke",
    GAME_LIST = "game_list",
    GAME_DELIST = "game_delist",
    RSVP_REQUEST = "rsvp_request",
    RSVP_RESPONSE = "rsvp_response",
    DIRECT_MESSAGE = "direct_message",
    TRUST_SYNC = "trust_sync"
}

export interface MessageEnvelope {
    version: 1;
    type: MessageType;
    fromFingerprint: string;
    toFingerprint?: string;
    timestamp: number;
    payload: string;
    signature: string;
}

export interface DirectMessage {
    id: string;
    fromFingerprint: string;
    toFingerprint: string;
    encryptedContent: string;
    timestamp: number;
    readAt?: number;
}

export interface PeerAnnounce {
    gpgFingerprint: string;
    i2pDestination: string;
    publicKeyArmored: string;
    profileJson?: string;
}

export interface PeerDiscover {
    requestingFingerprint: string;
    maxPeers?: number;
}
