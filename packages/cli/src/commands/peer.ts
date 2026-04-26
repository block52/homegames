import { Command } from "commander";
import ora from "ora";
import {
    HomeGamesDatabase,
    PlayerRepository,
    LocalIdentityRepository,
    ConfigRepository,
    normalizeFingerprint,
    decryptSymmetric,
    NetworkService,
    NetworkStatus
} from "@homegames/core";
import * as output from "../utils/output.js";
import { askPassphrase } from "../utils/prompts.js";

export function registerPeerCommands(program: Command): void {
    const peer = program
        .command("peer")
        .description("Manage known peers and P2P networking");

    peer
        .command("list")
        .description("List all known peers")
        .option("--trusted", "Show only trusted peers")
        .option("--untrusted", "Show only untrusted peers")
        .option("--connected", "Show only connected peers (requires active connection)")
        .action(async (options) => {
            const db = new HomeGamesDatabase();
            const playerRepo = new PlayerRepository(db.getConnection());

            let players;
            let title;

            if (options.trusted) {
                players = playerRepo.getByTrustStatus("trusted");
                title = "Trusted Peers";
            } else if (options.untrusted) {
                players = playerRepo.getByTrustStatus("untrusted");
                title = "Untrusted Peers";
            } else {
                players = playerRepo.getAll();
                title = "All Known Peers";
            }

            console.log();
            output.heading(title);
            console.log();

            if (players.length === 0) {
                output.info("No peers found.");
            } else {
                const rows = players.map(p => {
                    let nickname = "-";
                    if (p.profileJson) {
                        try {
                            const profile = JSON.parse(p.profileJson);
                            nickname = profile.nickname || "-";
                        } catch {
                            // ignore
                        }
                    }
                    const hasI2p = p.i2pDestination ? "Yes" : "No";
                    return [
                        output.shortenFingerprint(p.gpgFingerprint),
                        nickname,
                        p.trustStatus,
                        hasI2p,
                        output.formatTimestamp(p.lastSeen)
                    ];
                });

                output.table(["Fingerprint", "Nickname", "Status", "I2P", "Last Seen"], rows);
            }

            console.log();
            output.dim(`Total: ${players.length} peers`);

            db.close();
        });

    peer
        .command("show")
        .description("Show details of a peer")
        .argument("<fingerprint>", "GPG fingerprint of the peer")
        .action(async (fingerprint) => {
            const normalizedFp = normalizeFingerprint(fingerprint);

            const db = new HomeGamesDatabase();
            const playerRepo = new PlayerRepository(db.getConnection());

            const player = playerRepo.getByFingerprint(normalizedFp);
            if (!player) {
                output.error("Peer not found.");
                db.close();
                return;
            }

            console.log();
            output.heading("Peer Details");
            console.log();
            console.log(`Fingerprint:  ${output.formatFingerprint(player.gpgFingerprint)}`);
            console.log(`Trust Status: ${output.formatTrustStatus(player.trustStatus)}`);
            console.log(`First Seen:   ${output.formatTimestamp(player.firstSeen)}`);
            console.log(`Last Seen:    ${output.formatTimestamp(player.lastSeen)}`);

            if (player.i2pDestination) {
                console.log(`I2P Address:  ${player.i2pDestination.slice(0, 32)}...`);
            } else {
                console.log(`I2P Address:  Not available`);
            }

            if (player.profileJson) {
                try {
                    const profile = JSON.parse(player.profileJson);
                    console.log();
                    output.heading("Profile");
                    if (profile.nickname) console.log(`  Nickname:        ${profile.nickname}`);
                    if (profile.generalLocation) console.log(`  Location:        ${profile.generalLocation}`);
                    if (profile.preferredStakes) console.log(`  Stakes:          ${profile.preferredStakes.join(", ")}`);
                    if (profile.gameTypes) console.log(`  Game Types:      ${profile.gameTypes.join(", ")}`);
                } catch {
                    // ignore
                }
            }

            db.close();
        });

    peer
        .command("block")
        .description("Block a peer")
        .argument("<fingerprint>", "GPG fingerprint of the peer to block")
        .action(async (fingerprint) => {
            const normalizedFp = normalizeFingerprint(fingerprint);

            const db = new HomeGamesDatabase();
            const playerRepo = new PlayerRepository(db.getConnection());

            if (!playerRepo.exists(normalizedFp)) {
                output.error("Peer not found.");
                db.close();
                return;
            }

            playerRepo.updateTrustStatus(normalizedFp, "blocked");
            output.success(`Peer ${output.shortenFingerprint(normalizedFp)} has been blocked.`);

            db.close();
        });

    peer
        .command("unblock")
        .description("Unblock a peer")
        .argument("<fingerprint>", "GPG fingerprint of the peer to unblock")
        .action(async (fingerprint) => {
            const normalizedFp = normalizeFingerprint(fingerprint);

            const db = new HomeGamesDatabase();
            const playerRepo = new PlayerRepository(db.getConnection());

            const player = playerRepo.getByFingerprint(normalizedFp);
            if (!player) {
                output.error("Peer not found.");
                db.close();
                return;
            }

            if (player.trustStatus !== "blocked") {
                output.info("Peer is not blocked.");
                db.close();
                return;
            }

            playerRepo.updateTrustStatus(normalizedFp, "untrusted");
            output.success(`Peer ${output.shortenFingerprint(normalizedFp)} has been unblocked.`);

            db.close();
        });

    peer
        .command("connect")
        .description("Connect to the I2P network")
        .option("-d, --destination <dest>", "Connect to a specific I2P destination")
        .action(async (options) => {
            const db = new HomeGamesDatabase();
            const identityRepo = new LocalIdentityRepository(db.getConnection());

            const localIdentity = identityRepo.get();
            if (!localIdentity) {
                output.error("No identity found. Run 'homegames identity create' first.");
                db.close();
                return;
            }

            const passphrase = await askPassphrase();

            const spinner = ora("Decrypting identity...").start();

            let privateKeyArmored: string;
            try {
                privateKeyArmored = await decryptSymmetric(
                    localIdentity.privateKeyEncrypted,
                    passphrase
                );
            } catch {
                spinner.fail("Invalid passphrase");
                db.close();
                return;
            }

            spinner.text = "Connecting to SAM bridge...";

            try {
                const networkService = new NetworkService(db.getConnection());

                await networkService.initialize(
                    localIdentity.fingerprint,
                    privateKeyArmored,
                    passphrase,
                    localIdentity.publicKey
                );

                // Setup event handlers
                networkService.on("status", (status: NetworkStatus) => {
                    if (status === NetworkStatus.CONNECTING) {
                        spinner.text = "Connecting to I2P network...";
                    } else if (status === NetworkStatus.CONNECTED) {
                        spinner.text = "Connected!";
                    } else if (status === NetworkStatus.ERROR) {
                        spinner.text = "Connection error";
                    }
                });

                networkService.on("error", (err: Error) => {
                    output.error(err.message);
                });

                await networkService.start();

                const destination = networkService.getDestination();

                spinner.succeed("Connected to I2P network!");

                console.log();
                output.heading("Network Status");
                console.log();
                if (destination) {
                    console.log(`Your I2P Address: ${destination.base32}`);
                    console.log();
                    output.dim("Full destination (share with peers):");
                    console.log(destination.base64.substring(0, 80) + "...");
                }

                // If a specific destination was provided, connect to it
                if (options.destination) {
                    console.log();
                    const connectSpinner = ora("Connecting to peer...").start();
                    try {
                        await networkService.connectToDestination(options.destination);
                        connectSpinner.succeed("Connected to peer!");
                    } catch (err) {
                        connectSpinner.fail(`Failed to connect: ${(err as Error).message}`);
                    }
                }

                console.log();
                output.info("Press Ctrl+C to disconnect.");

                // Keep the process running
                await new Promise(() => {});

            } catch (err) {
                spinner.fail("Failed to connect to I2P network");
                console.log();
                output.error((err as Error).message);
                console.log();
                output.info("Make sure i2pd is running with SAM bridge enabled on port 7656.");
                output.info("Install i2pd: https://i2pd.readthedocs.io/en/latest/user-guide/install/");
            }

            db.close();
        });

    peer
        .command("discover")
        .description("Discover new peers on the network")
        .action(async () => {
            const db = new HomeGamesDatabase();
            const identityRepo = new LocalIdentityRepository(db.getConnection());

            const localIdentity = identityRepo.get();
            if (!localIdentity) {
                output.error("No identity found. Run 'homegames identity create' first.");
                db.close();
                return;
            }

            const passphrase = await askPassphrase();

            const spinner = ora("Connecting to network...").start();

            let privateKeyArmored: string;
            try {
                privateKeyArmored = await decryptSymmetric(
                    localIdentity.privateKeyEncrypted,
                    passphrase
                );
            } catch {
                spinner.fail("Invalid passphrase");
                db.close();
                return;
            }

            try {
                const networkService = new NetworkService(db.getConnection());

                await networkService.initialize(
                    localIdentity.fingerprint,
                    privateKeyArmored,
                    passphrase,
                    localIdentity.publicKey
                );

                await networkService.start();

                spinner.text = "Discovering peers...";

                const peers = await networkService.discover();

                spinner.succeed(`Found ${peers.length} peers with I2P addresses`);

                if (peers.length > 0) {
                    console.log();
                    output.heading("Discovered Peers");
                    console.log();

                    const rows = peers.map(p => {
                        let nickname = "-";
                        if (p.profileJson) {
                            try {
                                const profile = JSON.parse(p.profileJson);
                                nickname = profile.nickname || "-";
                            } catch {
                                // ignore
                            }
                        }
                        return [
                            output.shortenFingerprint(p.gpgFingerprint),
                            nickname,
                            p.trustStatus,
                            p.i2pDestination?.slice(0, 20) + "..." || "-"
                        ];
                    });

                    output.table(["Fingerprint", "Nickname", "Status", "I2P Dest"], rows);
                }

                await networkService.stop();

            } catch (err) {
                spinner.fail("Failed to discover peers");
                output.error((err as Error).message);
                output.info("Make sure i2pd is running with SAM bridge enabled.");
            }

            db.close();
        });

    peer
        .command("status")
        .description("Show I2P network status")
        .action(async () => {
            const db = new HomeGamesDatabase();
            const configRepo = new ConfigRepository(db.getConnection());
            const playerRepo = new PlayerRepository(db.getConnection());

            // Check for stored I2P destination
            const publicDest = configRepo.get("i2p.destination.public");
            const base32 = configRepo.get("i2p.destination.base32");

            console.log();
            output.heading("I2P Network Status");
            console.log();

            if (base32) {
                console.log(`Stored I2P Address: ${base32}`);
                console.log();
            } else {
                console.log("No I2P destination stored. Run 'homegames peer connect' to generate one.");
                console.log();
            }

            // Count peers with I2P addresses
            const allPeers = playerRepo.getAll();
            const peersWithI2p = allPeers.filter(p => p.i2pDestination);

            console.log(`Known peers:          ${allPeers.length}`);
            console.log(`Peers with I2P:       ${peersWithI2p.length}`);
            console.log(`Trusted peers:        ${playerRepo.countByTrustStatus("trusted")}`);

            db.close();
        });
}
