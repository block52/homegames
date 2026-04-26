#!/usr/bin/env node
import { Command } from "commander";
import { registerIdentityCommands } from "./commands/identity.js";
import { registerVouchCommands } from "./commands/vouch.js";
import { registerPeerCommands } from "./commands/peer.js";
import { registerGameCommands } from "./commands/game.js";

const program = new Command();

program
    .name("homegames")
    .description("P2P home poker game discovery platform with Web of Trust")
    .version("0.1.0");

// Register command groups
registerIdentityCommands(program);
registerVouchCommands(program);
registerPeerCommands(program);
registerGameCommands(program);

// Add info command
program
    .command("info")
    .description("Show information about HomeGames")
    .action(() => {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                        HOMEGAMES                               ║
║         P2P Home Poker Game Discovery Platform                 ║
╠═══════════════════════════════════════════════════════════════╣
║                                                                ║
║  A decentralized platform for finding and advertising         ║
║  home poker games with privacy and trust at its core.         ║
║                                                                ║
║  FEATURES:                                                     ║
║  • GPG-based cryptographic identity                            ║
║  • Web of Trust (3 vouches required for game access)           ║
║  • I2P anonymous networking (Phase 2)                          ║
║  • Encrypted game locations visible only to trusted players    ║
║                                                                ║
║  QUICK START:                                                  ║
║  1. homegames identity create    Create your identity          ║
║  2. homegames identity export    Share your public key         ║
║  3. homegames identity import    Import a friend's key         ║
║  4. homegames vouch create       Vouch for trusted players     ║
║                                                                ║
║  TRUST REQUIREMENTS:                                           ║
║  • 3 vouches from trusted players to see game details          ║
║  • 30-day cooling period before you can vouch for others       ║
║  • Maximum 10 vouches per month to prevent abuse               ║
║                                                                ║
╚═══════════════════════════════════════════════════════════════╝
`);
    });

program.parse();
