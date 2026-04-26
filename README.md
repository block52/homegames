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

### Phase 3 (Planned)
- [ ] Game listing & discovery
- [ ] Encrypted game details
- [ ] Electron desktop app
- [ ] Real-time game updates

## License

MIT
