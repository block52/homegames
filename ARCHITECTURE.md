# HomeGames P2P Architecture

A decentralized, privacy-focused platform for advertising home poker games using a Web of Trust model.

---

## Overview

HomeGames is a peer-to-peer application that allows players to discover and advertise private home games while maintaining strict privacy and security through:

- **I2P (Invisible Internet Project)** - Anonymous overlay network for communication
- **GPG (GNU Privacy Guard)** - Cryptographic identity and message signing
- **Web of Trust** - Vouching system requiring 3 endorsements for game visibility

---

## Core Principles

1. **No Central Server** - All nodes are equal peers
2. **Privacy by Default** - Game details only visible to trusted players
3. **Cryptographic Identity** - GPG keys as player identity
4. **Decentralized Trust** - Community-driven vouching system
5. **Offline-First** - Works without constant connectivity

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HOMEGAMES NODE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   Web UI     │    │   CLI        │    │   Mobile     │   ← User Interfaces│
│  │   (React)    │    │   Interface  │    │   (React     │                   │
│  │              │    │              │    │    Native)   │                   │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                   │
│         │                   │                   │                            │
│         └───────────────────┼───────────────────┘                            │
│                             │                                                │
│                             ▼                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        APPLICATION LAYER                              │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │   Game      │  │   Trust     │  │   Player    │  │   Message   │  │   │
│  │  │   Manager   │  │   Engine    │  │   Registry  │  │   Router    │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                             │                                                │
│                             ▼                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        SECURITY LAYER                                 │   │
│  │  ┌─────────────────────────┐    ┌─────────────────────────────────┐  │   │
│  │  │      GPG Engine         │    │      Vouch Verification         │  │   │
│  │  │  - Key Management       │    │  - Signature Validation         │  │   │
│  │  │  - Sign/Verify          │    │  - Trust Graph Calculation      │  │   │
│  │  │  - Encrypt/Decrypt      │    │  - Revocation Handling          │  │   │
│  │  └─────────────────────────┘    └─────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                             │                                                │
│                             ▼                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        NETWORK LAYER                                  │   │
│  │  ┌─────────────────────────┐    ┌─────────────────────────────────┐  │   │
│  │  │      I2P Transport      │    │      Local Discovery (mDNS)     │  │   │
│  │  │  - SAM Bridge           │    │  - LAN Game Sharing             │  │   │
│  │  │  - Destination Keys     │    │  - Direct P2P (trusted)         │  │   │
│  │  │  - Streaming/Datagrams  │    │                                 │  │   │
│  │  └─────────────────────────┘    └─────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                             │                                                │
│                             ▼                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        STORAGE LAYER                                  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │   SQLite    │  │   GPG       │  │   Config    │  │   Cache     │  │   │
│  │  │   Database  │  │   Keyring   │  │   Store     │  │   (Redis)   │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           I2P NETWORK                                        │
│                                                                              │
│    ┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────┐          │
│    │  Node   │◄────►│  Node   │◄────►│  Node   │◄────►│  Node   │          │
│    │    A    │      │    B    │      │    C    │      │    D    │          │
│    └─────────┘      └─────────┘      └─────────┘      └─────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Identity System (GPG-Based)

```
┌────────────────────────────────────────────────────────────┐
│                    PLAYER IDENTITY                          │
├────────────────────────────────────────────────────────────┤
│                                                             │
│   GPG Key Pair                                              │
│   ├── Public Key (shared with network)                     │
│   │   ├── Key ID (short identifier)                        │
│   │   ├── Fingerprint (full verification)                  │
│   │   └── User ID (optional nickname)                      │
│   │                                                         │
│   └── Private Key (local only, passphrase protected)       │
│       └── Used for signing vouches & game listings         │
│                                                             │
│   I2P Destination                                           │
│   ├── Base64 Address (~520 chars)                          │
│   └── Base32 Address (.b32.i2p)                            │
│                                                             │
│   Player Profile (signed by GPG key)                        │
│   ├── Preferred stakes                                      │
│   ├── Game types                                            │
│   ├── General location (city-level, optional)              │
│   └── Reputation metrics                                    │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

#### Identity Creation Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Generate  │────►│   Create    │────►│   Start     │────►│   Ready to  │
│   GPG Key   │     │   Profile   │     │   I2P Node  │     │   Connect   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                   │                   │                    │
      ▼                   ▼                   ▼                    ▼
 4096-bit RSA        Sign profile       Generate I2P         Announce to
 or Ed25519          with GPG key       destination          known peers
```

### 2. Web of Trust (Vouching System)

```
                         TRUST GRAPH EXAMPLE

                    ┌─────┐
           ┌───────►│  A  │◄───────┐
           │        └─────┘        │
           │            │          │
        vouches      vouches    vouches
           │            │          │
           │            ▼          │
       ┌─────┐      ┌─────┐    ┌─────┐
       │  B  │─────►│  D  │◄───│  C  │
       └─────┘      └─────┘    └─────┘
           │            │          │
           │         3 vouches     │
           │        (VERIFIED)     │
           │            │          │
           │            ▼          │
           │       ┌─────────┐     │
           └──────►│ NEW (E) │◄────┘
                   └─────────┘
                        │
                   Can now see
                   game listings
```

#### Vouch Data Structure

```typescript
interface Vouch {
  // The player being vouched for
  vouchee_gpg_fingerprint: string;
  vouchee_i2p_destination: string;

  // The player giving the vouch
  voucher_gpg_fingerprint: string;

  // Vouch details
  timestamp: number;           // Unix timestamp
  trust_level: 1 | 2 | 3;      // 1=met online, 2=met in person, 3=long-term trust

  // Optional context
  note_encrypted?: string;     // Encrypted note (only readable by vouchee)

  // Cryptographic proof
  gpg_signature: string;       // Detached signature of above fields
}
```

#### Trust Calculation Algorithm

```
FUNCTION calculate_trust(player_fingerprint):
    vouches = get_all_vouches_for(player_fingerprint)

    valid_vouches = []
    FOR EACH vouch IN vouches:
        IF verify_gpg_signature(vouch) AND
           NOT is_revoked(vouch) AND
           is_voucher_trusted(vouch.voucher_fingerprint):
            valid_vouches.append(vouch)

    IF count(valid_vouches) >= 3:
        RETURN TRUSTED
    ELSE:
        RETURN UNTRUSTED (needs {3 - count} more vouches)
```

#### Anti-Sybil Measures

1. **Vouch Cooling Period** - New accounts cannot vouch for others for 30 days
2. **Vouch Limits** - Each player can only vouch for 10 new players per month
3. **Chain Depth** - Trust diminishes at >3 hops from original trusted seed
4. **Mutual Vouch Bonus** - Bidirectional vouches carry more weight
5. **Revocation Propagation** - Revoking trust cascades through the graph

### 3. Game Listing System

```
┌────────────────────────────────────────────────────────────┐
│                    GAME LISTING                             │
├────────────────────────────────────────────────────────────┤
│                                                             │
│   Encrypted Layer (visible only to trusted players)        │
│   ├── Location (address or meeting instructions)           │
│   ├── Host contact details                                  │
│   ├── Exact start time                                      │
│   └── Specific house rules                                  │
│                                                             │
│   Public Layer (visible to all, for discovery)             │
│   ├── Game type (Hold'em, Omaha, etc.)                     │
│   ├── Stakes range (e.g., "$1/$2")                         │
│   ├── General area (e.g., "Downtown Melbourne")            │
│   ├── Day of week                                           │
│   ├── Seats available                                       │
│   ├── Host GPG fingerprint                                  │
│   └── Minimum trust level required                          │
│                                                             │
│   Metadata                                                   │
│   ├── Listing ID (hash of content)                         │
│   ├── Created timestamp                                     │
│   ├── Expires timestamp                                     │
│   └── GPG signature of host                                 │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

#### Game Discovery Flow

```
┌──────────────┐                                    ┌──────────────┐
│   Player A   │                                    │   Player B   │
│   (Host)     │                                    │   (Seeker)   │
└──────┬───────┘                                    └──────┬───────┘
       │                                                   │
       │  1. Create game listing                           │
       │     - Public info (stakes, type)                  │
       │     - Encrypted info (location)                   │
       │     - Sign with GPG key                           │
       ▼                                                   │
┌──────────────┐                                           │
│   Broadcast  │                                           │
│   to I2P     │                                           │
│   Network    │                                           │
└──────┬───────┘                                           │
       │                                                   │
       │  2. Listing propagates through network            │
       │                                                   │
       ▼                                                   │
┌──────────────┐                                           │
│   DHT        │◄──────────────────────────────────────────┤
│   Storage    │     3. Player B searches for games        │
└──────┬───────┘                                           │
       │                                                   │
       │  4. Return matching listings                      │
       │                                                   │
       ├───────────────────────────────────────────────────►
       │                                                   │
       │                                      ┌────────────▼────────────┐
       │                                      │  5. Check trust level   │
       │                                      │     - Has 3+ vouches?   │
       │                                      │     - Meets minimum?    │
       │                                      └────────────┬────────────┘
       │                                                   │
       │                                      ┌────────────▼────────────┐
       │                                      │  6. If trusted:         │
       │                                      │     Decrypt private     │
       │                                      │     game details        │
       │                                      └────────────┬────────────┘
       │                                                   │
       │  7. RSVP request (encrypted to host)              │
       │◄──────────────────────────────────────────────────┤
       │                                                   │
       │  8. Host verifies seeker trust level              │
       │                                                   │
       │  9. Accept/Decline (encrypted response)           │
       ├───────────────────────────────────────────────────►
       │                                                   │
       ▼                                                   ▼
```

### 4. Network Layer (I2P Integration)

```
┌─────────────────────────────────────────────────────────────┐
│                    I2P INTEGRATION                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   SAM (Simple Anonymous Messaging) Bridge                    │
│   ├── Connect to local I2P router (port 7656)               │
│   ├── Create session for HomeGames                           │
│   └── Generate destination keypair                           │
│                                                              │
│   Communication Patterns                                     │
│   ├── Streaming (TCP-like)                                   │
│   │   └── Used for: RSVP requests, direct messages          │
│   │                                                          │
│   └── Datagrams (UDP-like)                                   │
│       └── Used for: Game announcements, peer discovery      │
│                                                              │
│   Addressbook Integration                                    │
│   ├── Map GPG fingerprints to I2P destinations              │
│   └── Cache frequently contacted peers                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### I2P Destination Mapping

```
┌─────────────────────────────────────────────────────────────────┐
│                      PEER REGISTRY                               │
├──────────────────┬──────────────────────────────────────────────┤
│  GPG Fingerprint │  I2P Destination                              │
├──────────────────┼──────────────────────────────────────────────┤
│  A1B2C3D4E5F6... │  abcd1234...AAAA.b32.i2p                     │
│  F6E5D4C3B2A1... │  efgh5678...BBBB.b32.i2p                     │
│  ...             │  ...                                          │
└──────────────────┴──────────────────────────────────────────────┘

Note: This mapping is signed by the GPG key owner to prevent
impersonation. Peers verify signatures before trusting mappings.
```

### 5. Data Storage

```
┌─────────────────────────────────────────────────────────────┐
│                    LOCAL DATABASE (SQLite)                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Tables:                                                    │
│                                                              │
│   players                                                    │
│   ├── gpg_fingerprint (PK)                                  │
│   ├── i2p_destination                                        │
│   ├── public_key_armored                                     │
│   ├── profile_json (signed)                                  │
│   ├── trust_status (untrusted/trusted/blocked)              │
│   ├── first_seen                                             │
│   └── last_seen                                              │
│                                                              │
│   vouches                                                     │
│   ├── id (PK)                                                │
│   ├── voucher_fingerprint (FK)                              │
│   ├── vouchee_fingerprint (FK)                              │
│   ├── trust_level                                            │
│   ├── timestamp                                              │
│   ├── signature                                              │
│   └── revoked_at (nullable)                                  │
│                                                              │
│   games                                                       │
│   ├── listing_id (PK, hash)                                  │
│   ├── host_fingerprint (FK)                                  │
│   ├── public_data_json                                       │
│   ├── encrypted_data_blob                                    │
│   ├── signature                                              │
│   ├── created_at                                             │
│   └── expires_at                                             │
│                                                              │
│   rsvps                                                       │
│   ├── id (PK)                                                │
│   ├── game_listing_id (FK)                                   │
│   ├── player_fingerprint (FK)                               │
│   ├── status (pending/accepted/declined)                    │
│   └── timestamp                                              │
│                                                              │
│   messages                                                    │
│   ├── id (PK)                                                │
│   ├── from_fingerprint                                       │
│   ├── to_fingerprint                                         │
│   ├── encrypted_content                                      │
│   ├── timestamp                                              │
│   └── read_at (nullable)                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Protocol Messages

### Message Envelope Format

```typescript
interface MessageEnvelope {
  version: 1;
  type: MessageType;
  from_fingerprint: string;
  to_fingerprint?: string;      // null for broadcasts
  timestamp: number;
  payload: string;              // JSON, may be encrypted
  signature: string;            // GPG signature of above fields
}

enum MessageType {
  PEER_ANNOUNCE = 'peer_announce',
  PEER_DISCOVER = 'peer_discover',
  VOUCH_CREATE = 'vouch_create',
  VOUCH_REVOKE = 'vouch_revoke',
  GAME_LIST = 'game_list',
  GAME_DELIST = 'game_delist',
  RSVP_REQUEST = 'rsvp_request',
  RSVP_RESPONSE = 'rsvp_response',
  DIRECT_MESSAGE = 'direct_message',
  TRUST_SYNC = 'trust_sync',
}
```

### Key Protocol Flows

#### Peer Discovery

```
Node A                           Node B (known)                    Node C (new)
   │                                  │                                  │
   │  1. PEER_DISCOVER request        │                                  │
   ├─────────────────────────────────►│                                  │
   │                                  │                                  │
   │  2. PEER_ANNOUNCE (list of       │                                  │
   │     known peers with their       │                                  │
   │     GPG fingerprints)            │                                  │
   │◄─────────────────────────────────┤                                  │
   │                                  │                                  │
   │  3. PEER_ANNOUNCE (introduce self)                                  │
   ├─────────────────────────────────────────────────────────────────────►
   │                                                                     │
   │  4. PEER_ANNOUNCE (response with public key)                        │
   │◄────────────────────────────────────────────────────────────────────┤
   │                                                                     │
```

#### Vouch Creation

```
Voucher                         Network                          Vouchee
   │                               │                                │
   │  1. Create vouch struct       │                                │
   │     with vouchee details      │                                │
   │                               │                                │
   │  2. Sign with GPG key         │                                │
   │                               │                                │
   │  3. VOUCH_CREATE broadcast    │                                │
   ├──────────────────────────────►│                                │
   │                               │                                │
   │                               │  4. Propagate to all peers     │
   │                               ├───────────────────────────────►│
   │                               │                                │
   │                               │  5. Vouchee stores vouch       │
   │                               │     and recalculates trust     │
   │                               │                                │
```

---

## Security Considerations

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Sybil attacks (fake identities) | Vouch limits, cooling periods, chain depth |
| Traffic analysis | I2P garlic routing, no clearnet connections |
| Key compromise | Key revocation propagation, re-keying support |
| Spam/DoS | Rate limiting, proof-of-work for broadcasts |
| Game location leaks | Encryption to trusted keys only |
| Vouch collusion | Graph analysis, reputation decay |
| Replay attacks | Timestamps + nonces in signed messages |

### Key Management

```
┌─────────────────────────────────────────────────────────────┐
│                    KEY LIFECYCLE                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   1. Generation                                              │
│      └── 4096-bit RSA or Ed25519 (recommended)              │
│                                                              │
│   2. Backup                                                  │
│      └── Encrypted export with strong passphrase            │
│                                                              │
│   3. Regular Use                                             │
│      └── Passphrase cached in memory (configurable timeout) │
│                                                              │
│   4. Rotation (recommended yearly)                           │
│      └── Sign new key with old key, broadcast transition    │
│                                                              │
│   5. Revocation                                              │
│      └── Broadcast revocation certificate                    │
│      └── All vouches from this key become invalid           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Recommended Implementation

```
┌─────────────────────────────────────────────────────────────┐
│                    TECH STACK                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Core Runtime                                               │
│   └── Node.js (for cross-platform desktop app)              │
│       OR Rust (for performance-critical daemon)             │
│                                                              │
│   Cryptography                                               │
│   ├── openpgp.js (JavaScript GPG implementation)            │
│   │   OR sequoia-pgp (Rust)                                 │
│   └── libsodium (additional symmetric crypto)               │
│                                                              │
│   I2P Integration                                            │
│   ├── i2pd (lightweight I2P router, C++)                    │
│   └── SAM protocol client library                           │
│                                                              │
│   Storage                                                    │
│   ├── SQLite (local database)                               │
│   └── LevelDB (DHT cache, optional)                         │
│                                                              │
│   UI Framework                                               │
│   ├── Electron + React (desktop)                            │
│   └── React Native (mobile, future)                         │
│                                                              │
│   Build & Distribution                                       │
│   ├── electron-builder (desktop packages)                   │
│   └── Reproducible builds (security)                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Dependencies

```json
{
  "core": {
    "openpgp": "^5.x",
    "better-sqlite3": "^9.x",
    "i2p-sam": "custom-implementation"
  },
  "ui": {
    "electron": "^28.x",
    "react": "^18.x",
    "zustand": "^4.x"
  },
  "networking": {
    "libp2p": "optional-fallback",
    "multiaddr": "^12.x"
  }
}
```

---

## Directory Structure

```
homegames/
├── packages/
│   ├── core/                    # Core library (can be used headless)
│   │   ├── src/
│   │   │   ├── crypto/          # GPG operations
│   │   │   │   ├── keyring.ts
│   │   │   │   ├── sign.ts
│   │   │   │   └── encrypt.ts
│   │   │   ├── trust/           # Web of trust engine
│   │   │   │   ├── vouch.ts
│   │   │   │   ├── graph.ts
│   │   │   │   └── calculate.ts
│   │   │   ├── network/         # I2P integration
│   │   │   │   ├── sam.ts
│   │   │   │   ├── peer.ts
│   │   │   │   └── protocol.ts
│   │   │   ├── game/            # Game listing management
│   │   │   │   ├── listing.ts
│   │   │   │   ├── rsvp.ts
│   │   │   │   └── search.ts
│   │   │   ├── storage/         # Database layer
│   │   │   │   ├── db.ts
│   │   │   │   ├── migrations/
│   │   │   │   └── models/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── cli/                     # Command-line interface
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── identity.ts
│   │   │   │   ├── vouch.ts
│   │   │   │   ├── game.ts
│   │   │   │   └── network.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── desktop/                 # Electron desktop app
│       ├── src/
│       │   ├── main/            # Electron main process
│       │   ├── renderer/        # React UI
│       │   │   ├── components/
│       │   │   ├── pages/
│       │   │   └── hooks/
│       │   └── preload/
│       └── package.json
│
├── docs/
│   ├── protocol.md              # Detailed protocol spec
│   ├── security.md              # Security audit notes
│   └── user-guide.md
│
├── scripts/
│   ├── setup-i2p.sh             # I2P router setup helper
│   └── generate-test-network.ts # For development
│
├── package.json                 # Workspace root
├── tsconfig.json
└── ARCHITECTURE.md              # This file
```

---

## Implementation Phases

### Phase 1: Foundation
- GPG key generation and management
- Basic SQLite storage
- Identity creation and profile signing
- Vouch data structure and signature verification

### Phase 2: Networking
- I2P SAM bridge integration
- Peer discovery protocol
- Message routing and broadcasting
- Destination-to-fingerprint mapping

### Phase 3: Trust Engine
- Web of trust calculation
- Vouch creation and revocation
- Trust graph visualization
- Anti-Sybil measures

### Phase 4: Game Listings
- Game creation with encrypted details
- Search and filtering
- RSVP system
- Trust-gated content decryption

### Phase 5: User Interface
- CLI for power users
- Electron desktop app
- Notification system
- Settings and preferences

### Phase 6: Hardening
- Security audit
- Performance optimization
- Reproducible builds
- Documentation

---

## Bootstrap Problem Solution

New networks face the "empty room" problem. Solutions:

1. **Seed Nodes** - Initial trusted operators run bootstrap nodes
2. **IRL Onboarding** - Host a real game, vouch for attendees in person
3. **Import from Existing Networks** - Bridge trust from other poker communities
4. **Gradual Visibility** - Show game counts (not details) to encourage joining

```
┌─────────────────────────────────────────────────────────────┐
│                    ONBOARDING FLOW                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   New Player                                                 │
│       │                                                      │
│       ▼                                                      │
│   Create Identity (GPG + I2P)                                │
│       │                                                      │
│       ▼                                                      │
│   Connect to Seed Nodes                                      │
│       │                                                      │
│       ▼                                                      │
│   Browse public game metadata                                │
│   (can see: "5 games in your area this week")               │
│   (cannot see: locations, exact times, RSVP)                │
│       │                                                      │
│       ▼                                                      │
│   Find friends already in network                            │
│   OR attend a public poker meetup                            │
│       │                                                      │
│       ▼                                                      │
│   Get vouched by 3 trusted players                           │
│       │                                                      │
│       ▼                                                      │
│   Full access unlocked!                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## API Reference (Core Library)

```typescript
// Identity
createIdentity(options: IdentityOptions): Promise<Identity>
importIdentity(armoredKey: string, passphrase: string): Promise<Identity>
exportIdentity(passphrase: string): Promise<string>

// Trust
createVouch(voucheeFingerprint: string, level: TrustLevel): Promise<Vouch>
revokeVouch(vouchId: string): Promise<void>
getTrustStatus(fingerprint: string): Promise<TrustStatus>
getVouchesFor(fingerprint: string): Promise<Vouch[]>
getVouchesBy(fingerprint: string): Promise<Vouch[]>

// Games
createGameListing(game: GameDetails): Promise<GameListing>
searchGames(filters: GameFilters): Promise<GameListing[]>
requestRSVP(listingId: string): Promise<RSVPRequest>
respondToRSVP(requestId: string, accept: boolean): Promise<void>

// Network
connectToNetwork(): Promise<void>
disconnectFromNetwork(): Promise<void>
getConnectedPeers(): Promise<Peer[]>
sendMessage(to: string, content: string): Promise<void>

// Events
on('peer:discovered', callback: (peer: Peer) => void): void
on('vouch:received', callback: (vouch: Vouch) => void): void
on('game:listed', callback: (game: GameListing) => void): void
on('rsvp:received', callback: (rsvp: RSVPRequest) => void): void
on('message:received', callback: (msg: Message) => void): void
```

---

## Future Considerations

- **Reputation System** - Rate players after games (no-shows, good host, etc.)
- **Escrow Integration** - Trustless buy-in handling via smart contracts
- **Mobile App** - React Native client
- **Tor Support** - Alternative to I2P for users who prefer it
- **Multi-game Types** - Expand beyond poker to other home games
- **Calendar Integration** - Sync games to personal calendars (privacy-preserving)

---

## Conclusion

This architecture provides a robust foundation for private, trust-based game discovery while preserving player anonymity through I2P and cryptographic identity via GPG. The Web of Trust model ensures that only vouched players can access sensitive game information, creating a self-policing community that naturally excludes bad actors.

The modular design allows for incremental implementation and future expansion while maintaining security as the core principle throughout.
