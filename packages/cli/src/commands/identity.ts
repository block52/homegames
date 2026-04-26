import { Command } from "commander";
import ora from "ora";
import fs from "fs";
import {
    Keyring,
    HomeGamesDatabase,
    LocalIdentityRepository,
    PlayerRepository,
    encryptSymmetric,
    decryptSymmetric,
    timestampNow
} from "@homegames/core";
import * as output from "../utils/output.js";
import { askNewPassphrase, askPassphrase, confirm } from "../utils/prompts.js";

export function registerIdentityCommands(program: Command): void {
    const identity = program
        .command("identity")
        .description("Manage your cryptographic identity");

    identity
        .command("create")
        .description("Create a new GPG-based identity")
        .option("-n, --name <name>", "Your display name")
        .option("-e, --email <email>", "Your email address")
        .option("--key-type <type>", "Key type: rsa or ecc", "ecc")
        .action(async (options) => {
            const db = new HomeGamesDatabase();
            const identityRepo = new LocalIdentityRepository(db.getConnection());

            if (identityRepo.exists()) {
                const shouldOverwrite = await confirm(
                    "An identity already exists. Do you want to overwrite it?",
                    false
                );
                if (!shouldOverwrite) {
                    output.info("Operation cancelled.");
                    db.close();
                    return;
                }
            }

            const passphrase = await askNewPassphrase();

            const spinner = ora("Generating GPG key pair...").start();

            try {
                const keyring = new Keyring();
                const result = await keyring.generateKey({
                    name: options.name,
                    email: options.email,
                    passphrase,
                    keyType: options.keyType === "rsa" ? "rsa" : "ecc"
                });

                spinner.text = "Encrypting private key...";

                // Encrypt the private key with the passphrase for storage
                const encryptedPrivateKey = await encryptSymmetric(
                    result.privateKeyArmored,
                    passphrase
                );

                // Store the identity
                identityRepo.set(
                    result.fingerprint,
                    encryptedPrivateKey,
                    result.publicKeyArmored
                );

                // Also add ourselves to the players table as trusted
                const playerRepo = new PlayerRepository(db.getConnection());
                const now = timestampNow();
                playerRepo.create({
                    gpgFingerprint: result.fingerprint,
                    publicKeyArmored: result.publicKeyArmored,
                    trustStatus: "trusted"
                });

                spinner.succeed("Identity created successfully!");

                console.log();
                output.heading("Your Identity");
                console.log();
                console.log(`Fingerprint: ${output.formatFingerprint(result.fingerprint)}`);
                console.log(`Short ID:    ${output.shortenFingerprint(result.fingerprint)}`);
                if (options.name) console.log(`Name:        ${options.name}`);
                if (options.email) console.log(`Email:       ${options.email}`);
                console.log(`Key Type:    ${options.keyType.toUpperCase()}`);
                console.log();
                output.warn("IMPORTANT: Keep your passphrase safe. It cannot be recovered.");

                db.close();
            } catch (error) {
                spinner.fail("Failed to create identity");
                output.error((error as Error).message);
                db.close();
                process.exit(1);
            }
        });

    identity
        .command("show")
        .description("Display your current identity")
        .action(async () => {
            const db = new HomeGamesDatabase();
            const identityRepo = new LocalIdentityRepository(db.getConnection());

            const localIdentity = identityRepo.get();
            if (!localIdentity) {
                output.error("No identity found. Run 'homegames identity create' first.");
                db.close();
                return;
            }

            output.heading("Your Identity");
            console.log();
            console.log(`Fingerprint: ${output.formatFingerprint(localIdentity.fingerprint)}`);
            console.log(`Short ID:    ${output.shortenFingerprint(localIdentity.fingerprint)}`);
            console.log(`Created:     ${output.formatTimestamp(localIdentity.createdAt)}`);
            console.log(`Database:    ${db.getPath()}`);

            db.close();
        });

    identity
        .command("export")
        .description("Export your public key")
        .option("-o, --output <file>", "Output file path")
        .action(async (options) => {
            const db = new HomeGamesDatabase();
            const identityRepo = new LocalIdentityRepository(db.getConnection());

            const localIdentity = identityRepo.get();
            if (!localIdentity) {
                output.error("No identity found. Run 'homegames identity create' first.");
                db.close();
                return;
            }

            const publicKey = localIdentity.publicKey;

            if (options.output) {
                fs.writeFileSync(options.output, publicKey);
                output.success(`Public key exported to ${options.output}`);
            } else {
                console.log();
                console.log(publicKey);
            }

            db.close();
        });

    identity
        .command("import")
        .description("Import a public key from another player")
        .argument("<file>", "Path to the public key file")
        .action(async (file) => {
            if (!fs.existsSync(file)) {
                output.error(`File not found: ${file}`);
                process.exit(1);
            }

            const publicKeyArmored = fs.readFileSync(file, "utf-8");

            const spinner = ora("Importing public key...").start();

            try {
                const keyring = new Keyring();
                const { fingerprint } = await keyring.importPublicKey(publicKeyArmored);

                const db = new HomeGamesDatabase();
                const playerRepo = new PlayerRepository(db.getConnection());

                if (playerRepo.exists(fingerprint)) {
                    spinner.info("Player already exists in database.");
                    playerRepo.updateLastSeen(fingerprint);
                } else {
                    playerRepo.create({
                        gpgFingerprint: fingerprint,
                        publicKeyArmored,
                        trustStatus: "untrusted"
                    });
                    spinner.succeed("Public key imported successfully!");
                }

                console.log();
                console.log(`Fingerprint: ${output.formatFingerprint(fingerprint)}`);

                db.close();
            } catch (error) {
                spinner.fail("Failed to import public key");
                output.error((error as Error).message);
                process.exit(1);
            }
        });

    identity
        .command("unlock")
        .description("Unlock your identity (cache passphrase)")
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

            const spinner = ora("Unlocking identity...").start();

            try {
                // Decrypt the private key to verify passphrase
                const privateKeyArmored = await decryptSymmetric(
                    localIdentity.privateKeyEncrypted,
                    passphrase
                );

                // Load into keyring
                const keyring = new Keyring();
                await keyring.unlockKey(privateKeyArmored, passphrase);

                spinner.succeed("Identity unlocked successfully!");
                output.info("Note: The passphrase is cached in memory for this session.");

                db.close();
            } catch (error) {
                spinner.fail("Failed to unlock identity");
                output.error("Invalid passphrase or corrupted key.");
                db.close();
                process.exit(1);
            }
        });
}
