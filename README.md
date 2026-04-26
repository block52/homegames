# HomeGames

P2P home poker game discovery platform with Web of Trust.

A decentralized platform for finding and advertising home poker games with privacy and trust at its core.

## Features

- **GPG-based cryptographic identity** - Your identity is a GPG keypair
- **Web of Trust** - 3 vouches required from trusted players for game access
- **I2P anonymous networking** - Privacy-preserving P2P communication
- **Encrypted game locations** - Only visible to trusted players

## Requirements

- Node.js >= 22.0.0
- Yarn
- i2pd (for networking) - [Installation guide](https://i2pd.readthedocs.io/en/latest/user-guide/install/)

## Installation

```bash
# Install dependencies
yarn install

# Build all packages
yarn build
```

## Usage

Run the CLI from the project root:

```bash
node packages/cli/dist/index.js <command>
```

Or link it globally:

```bash
cd packages/cli
npm link
homegames <command>
```

### Quick Start

```bash
# 1. Create your identity
homegames identity create

# 2. View your identity
homegames identity show

# 3. Export your public key to share with others
homegames identity export

# 4. Import a friend's public key
homegames identity import <file>

# 5. Vouch for a trusted player
homegames vouch create <fingerprint>
```

### All Commands

| Command | Description |
|---------|-------------|
| `identity create` | Create a new cryptographic identity |
| `identity show` | Display your identity details |
| `identity export` | Export your public key |
| `identity import` | Import another player's public key |
| `vouch create` | Create a vouch for a trusted player |
| `vouch list` | List all vouches |
| `vouch revoke` | Revoke a vouch |
| `peer list` | List known peers |
| `peer connect` | Connect to the I2P network |
| `peer discover` | Discover new peers on the network |
| `peer status` | Show I2P network status |
| `game create` | Create a game listing (Phase 3) |
| `game list` | List available games (Phase 3) |
| `info` | Show platform information |

### I2P Networking

To use P2P networking features, you need i2pd running with SAM bridge enabled:

```bash
# Install i2pd (macOS)
brew install i2pd

# Start i2pd
i2pd

# Connect to the network
homegames peer connect

# Your I2P address will be displayed - share it with peers
```

## Trust Requirements

- **3 vouches** from trusted players to see game details
- **30-day cooling period** before you can vouch for others
- **Maximum 10 vouches per month** to prevent abuse

## Project Structure

```
homegames/
├── packages/
│   ├── core/           # Core library
│   │   ├── src/
│   │   │   ├── types/      # TypeScript interfaces
│   │   │   ├── crypto/     # GPG signing & encryption
│   │   │   ├── storage/    # SQLite database & repos
│   │   │   ├── trust/      # Web of Trust engine
│   │   │   └── network/    # I2P networking (Phase 2)
│   │   └── package.json
│   └── cli/            # Command-line interface
│       ├── src/
│       │   ├── commands/   # CLI commands
│       │   └── utils/      # Output formatting
│       └── package.json
├── package.json        # Workspace root
└── README.md
```

## Development

```bash
# Build all packages
yarn build

# Run tests
yarn test

# Clean build artifacts
yarn clean
```

## Roadmap

### Phase 1 (Complete)
- [x] Cryptographic identity (GPG keypairs)
- [x] Local SQLite storage
- [x] Web of Trust - vouch system
- [x] Trust calculation engine
- [x] CLI interface

### Phase 2 (Complete)
- [x] I2P network integration (SAM V3 protocol)
- [x] P2P peer discovery
- [x] Message signing and verification
- [x] Persistent I2P destinations

### Phase 3 — Game Listings (Not started)

All `game` CLI commands are currently stubs that print a "not implemented" warning. The `games` and `rsvps` SQLite tables exist (see `packages/core/src/storage/migrations/001_initial.ts`) but have no repository wrappers.

Concrete work required:

- [ ] **Core: game module** (`packages/core/src/game/`)
  - [ ] `listing.ts` — build/sign `GameListing` from `GamePublicData` + `GamePrivateData`; deterministic `listingId` (hash of public data + host fingerprint + createdAt)
  - [ ] `encrypt.ts` — encrypt `GamePrivateData` to the public keys of all currently-trusted players (≥3 vouches); re-encrypt when trust set changes
  - [ ] `search.ts` — apply `GameFilters` over local game cache
  - [ ] `rsvp.ts` — create/sign `RSVPRequest`, accept/decline flow
- [ ] **Core: storage repositories** (`packages/core/src/storage/repositories/`)
  - [ ] `games.ts` — CRUD for the `games` table, expiry pruning
  - [ ] `rsvps.ts` — CRUD for the `rsvps` table
- [ ] **Core: network integration** (extend `packages/core/src/network/message-handler.ts`)
  - [ ] Handle `GAME_LIST`, `GAME_DELIST`, `RSVP_REQUEST`, `RSVP_RESPONSE` (types already declared in `types/message.ts`)
  - [ ] Verify host signature + reject expired listings
  - [ ] Re-broadcast known listings to new peers on connect
- [ ] **CLI: wire up `game.ts`** (`packages/cli/src/commands/game.ts`)
  - [ ] `game create` — interactive prompt for stakes/type/area/location, calls core
  - [ ] `game list` — applies `--type` / `--stakes` / `--area` filters
  - [ ] `game show <id>` — decrypts private data if user is trusted
  - [ ] `game rsvp <id>` — sends RSVP to host
  - [ ] `game cancel <id>` — broadcasts `GAME_DELIST`
- [ ] **Tests** — none currently exist (`yarn test` runs nothing). Add at minimum:
  - [ ] Vouch signature round-trip + trust calculation edge cases
  - [ ] Game listing encrypt → decrypt with/without sufficient trust
  - [ ] Message envelope sign/verify

### Phase 4 — Desktop UI (Not started)

- [ ] `packages/desktop/` — Electron + React app per `ARCHITECTURE.md`
- [ ] Real-time game updates (subscribe to network events)
- [ ] Trust graph visualization
- [ ] Notification system for new vouches / RSVPs

### Phase 5 — Hardening (Not started)

- [ ] Anti-Sybil enforcement: 30-day vouch cooling + 10/month limit (documented in README, not enforced in `trust/vouch.ts`)
- [ ] Key rotation / revocation broadcast
- [ ] Reproducible builds for CLI distribution

## License

MIT
