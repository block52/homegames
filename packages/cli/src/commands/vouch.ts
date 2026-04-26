import { Command } from "commander";
import ora from "ora";
import {
    Keyring,
    HomeGamesDatabase,
    LocalIdentityRepository,
    PlayerRepository,
    VouchRepository,
    VouchService,
    TrustEngine,
    decryptSymmetric,
    normalizeFingerprint,
    VOUCH_REQUIREMENTS
} from "@homegames/core";
import * as output from "../utils/output.js";
import { askPassphrase, selectTrustLevel, askOptionalNote, confirm } from "../utils/prompts.js";

async function getUnlockedKeyring(db: HomeGamesDatabase): Promise<Keyring | null> {
    const identityRepo = new LocalIdentityRepository(db.getConnection());
    const localIdentity = identityRepo.get();

    if (!localIdentity) {
        output.error("No identity found. Run 'homegames identity create' first.");
        return null;
    }

    const passphrase = await askPassphrase("Enter your passphrase to sign the vouch:");

    try {
        const privateKeyArmored = await decryptSymmetric(
            localIdentity.privateKeyEncrypted,
            passphrase
        );

        const keyring = new Keyring();
        await keyring.unlockKey(privateKeyArmored, passphrase);
        await keyring.loadPublicKey(localIdentity.publicKey);

        return keyring;
    } catch {
        output.error("Invalid passphrase.");
        return null;
    }
}

export function registerVouchCommands(program: Command): void {
    const vouch = program
        .command("vouch")
        .description("Manage vouches in the Web of Trust");

    vouch
        .command("create")
        .description("Vouch for another player")
        .argument("<fingerprint>", "GPG fingerprint of the player to vouch for")
        .option("-l, --level <level>", "Trust level: 1, 2, or 3")
        .option("-n, --note <note>", "Optional note")
        .action(async (fingerprint, options) => {
            const normalizedFp = normalizeFingerprint(fingerprint);

            const db = new HomeGamesDatabase();
            const keyring = await getUnlockedKeyring(db);

            if (!keyring) {
                db.close();
                return;
            }

            const playerRepo = new PlayerRepository(db.getConnection());
            const vouchRepo = new VouchRepository(db.getConnection());
            const vouchService = new VouchService(vouchRepo, playerRepo, keyring);

            // Get trust level
            let trustLevel = options.level ? parseInt(options.level) : undefined;
            if (!trustLevel || trustLevel < 1 || trustLevel > 3) {
                trustLevel = await selectTrustLevel();
            }

            // Get optional note
            const note = options.note || (await askOptionalNote());

            const spinner = ora("Creating vouch...").start();

            try {
                const newVouch = await vouchService.createVouch({
                    voucheeFingerprint: normalizedFp,
                    trustLevel: trustLevel as 1 | 2 | 3,
                    note
                });

                spinner.succeed("Vouch created successfully!");
                console.log();
                console.log(`Vouch ID:    ${newVouch.id}`);
                console.log(`For:         ${output.shortenFingerprint(normalizedFp)}`);
                console.log(`Trust Level: ${output.formatTrustLevel(trustLevel)}`);
                console.log(`Timestamp:   ${output.formatTimestamp(newVouch.timestamp)}`);

                db.close();
            } catch (error) {
                spinner.fail("Failed to create vouch");
                output.error((error as Error).message);
                db.close();
                process.exit(1);
            }
        });

    vouch
        .command("revoke")
        .description("Revoke a vouch you previously gave")
        .argument("<fingerprint>", "GPG fingerprint of the player")
        .action(async (fingerprint) => {
            const normalizedFp = normalizeFingerprint(fingerprint);

            const db = new HomeGamesDatabase();
            const keyring = await getUnlockedKeyring(db);

            if (!keyring) {
                db.close();
                return;
            }

            const playerRepo = new PlayerRepository(db.getConnection());
            const vouchRepo = new VouchRepository(db.getConnection());
            const vouchService = new VouchService(vouchRepo, playerRepo, keyring);

            const shouldRevoke = await confirm(
                `Are you sure you want to revoke your vouch for ${output.shortenFingerprint(normalizedFp)}?`,
                false
            );

            if (!shouldRevoke) {
                output.info("Operation cancelled.");
                db.close();
                return;
            }

            try {
                vouchService.revokeVouch(normalizedFp);
                output.success("Vouch revoked successfully!");
                db.close();
            } catch (error) {
                output.error((error as Error).message);
                db.close();
                process.exit(1);
            }
        });

    vouch
        .command("list")
        .description("List vouches")
        .option("--for <fingerprint>", "Vouches FOR a player")
        .option("--by <fingerprint>", "Vouches BY a player")
        .option("--mine", "List vouches you have given")
        .action(async (options) => {
            const db = new HomeGamesDatabase();
            const vouchRepo = new VouchRepository(db.getConnection());
            const identityRepo = new LocalIdentityRepository(db.getConnection());

            let vouches;
            let title;

            if (options.for) {
                const fp = normalizeFingerprint(options.for);
                vouches = vouchRepo.getVouchesFor(fp);
                title = `Vouches for ${output.shortenFingerprint(fp)}`;
            } else if (options.by) {
                const fp = normalizeFingerprint(options.by);
                vouches = vouchRepo.getVouchesBy(fp);
                title = `Vouches by ${output.shortenFingerprint(fp)}`;
            } else if (options.mine) {
                const localIdentity = identityRepo.get();
                if (!localIdentity) {
                    output.error("No identity found.");
                    db.close();
                    return;
                }
                vouches = vouchRepo.getVouchesBy(localIdentity.fingerprint);
                title = "Your vouches";
            } else {
                vouches = vouchRepo.getAll();
                title = "All vouches";
            }

            console.log();
            output.heading(title);
            console.log();

            if (vouches.length === 0) {
                output.info("No vouches found.");
            } else {
                const rows = vouches.map(v => [
                    output.shortenFingerprint(v.voucherGpgFingerprint),
                    "→",
                    output.shortenFingerprint(v.voucheeGpgFingerprint),
                    `L${v.trustLevel}`,
                    v.revokedAt ? "REVOKED" : "Active",
                    output.formatTimestamp(v.timestamp)
                ]);

                output.table(["From", "", "To", "Level", "Status", "Date"], rows);
            }

            db.close();
        });

    vouch
        .command("status")
        .description("Check trust status of a player")
        .argument("<fingerprint>", "GPG fingerprint to check")
        .action(async (fingerprint) => {
            const normalizedFp = normalizeFingerprint(fingerprint);

            const db = new HomeGamesDatabase();
            const playerRepo = new PlayerRepository(db.getConnection());
            const vouchRepo = new VouchRepository(db.getConnection());

            const player = playerRepo.getByFingerprint(normalizedFp);
            if (!player) {
                output.error("Player not found. Import their public key first.");
                db.close();
                return;
            }

            const trustEngine = new TrustEngine(vouchRepo, playerRepo);

            const spinner = ora("Calculating trust status...").start();

            try {
                const result = await trustEngine.calculateTrust(normalizedFp);

                spinner.stop();

                console.log();
                output.heading(`Trust Status: ${output.shortenFingerprint(normalizedFp)}`);
                console.log();
                console.log(`Status:          ${output.formatTrustStatus(result.status)}`);
                console.log(`Valid Vouches:   ${result.validVouchCount}/${VOUCH_REQUIREMENTS.MINIMUM_VOUCHES}`);

                if (result.vouchesNeeded > 0) {
                    console.log(`Vouches Needed:  ${result.vouchesNeeded} more`);
                }

                if (result.validVouches.length > 0) {
                    console.log();
                    output.heading("Valid Vouches");
                    for (const v of result.validVouches) {
                        console.log(`  - From ${output.shortenFingerprint(v.voucherGpgFingerprint)} (Level ${v.trustLevel})`);
                    }
                }

                if (result.invalidReasons.size > 0) {
                    console.log();
                    output.heading("Invalid/Excluded Vouches");
                    for (const [id, reason] of result.invalidReasons) {
                        console.log(`  - ${id.slice(0, 8)}...: ${reason}`);
                    }
                }

                db.close();
            } catch (error) {
                spinner.fail("Failed to calculate trust");
                output.error((error as Error).message);
                db.close();
                process.exit(1);
            }
        });
}
