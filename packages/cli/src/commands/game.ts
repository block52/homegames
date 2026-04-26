import { Command } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import {
    HomeGamesDatabase,
    LocalIdentityRepository,
    PlayerRepository,
    VouchRepository,
    GameRepository,
    RSVPRepository,
    Keyring,
    TrustEngine,
    GameService,
    RSVPService,
    decryptSymmetric,
    decryptPrivateData,
    searchListings,
    GamePublicData,
    GamePrivateData,
    GameType,
    timestampNow,
    addDays
} from "@homegames/core";
import * as openpgp from "openpgp";
import * as output from "../utils/output.js";
import { askPassphrase } from "../utils/prompts.js";

const VALID_GAME_TYPES: GameType[] = ["holdem", "omaha", "plo", "mixed", "other"];

interface GameDeps {
    db: HomeGamesDatabase;
    keyring: Keyring;
    gameRepo: GameRepository;
    rsvpRepo: RSVPRepository;
    playerRepo: PlayerRepository;
    vouchRepo: VouchRepository;
    gameService: GameService;
    rsvpService: RSVPService;
    trustEngine: TrustEngine;
}

async function withUnlockedKeyring(): Promise<GameDeps | null> {
    const db = new HomeGamesDatabase();
    const identityRepo = new LocalIdentityRepository(db.getConnection());
    const localIdentity = identityRepo.get();

    if (!localIdentity) {
        output.error("No identity found. Run 'homegames identity create' first.");
        db.close();
        return null;
    }

    const passphrase = await askPassphrase();

    let privateKeyArmored: string;
    try {
        privateKeyArmored = await decryptSymmetric(localIdentity.privateKeyEncrypted, passphrase);
    } catch {
        output.error("Invalid passphrase.");
        db.close();
        return null;
    }

    const keyring = new Keyring();
    await keyring.unlockKey(privateKeyArmored, passphrase);
    await keyring.loadPublicKey(localIdentity.publicKey);

    const playerRepo = new PlayerRepository(db.getConnection());
    const vouchRepo = new VouchRepository(db.getConnection());
    const gameRepo = new GameRepository(db.getConnection());
    const rsvpRepo = new RSVPRepository(db.getConnection());
    const trustEngine = new TrustEngine(vouchRepo, playerRepo);
    const gameService = new GameService(gameRepo, playerRepo, trustEngine, keyring);
    const rsvpService = new RSVPService(rsvpRepo, gameRepo, playerRepo, keyring);

    return {
        db,
        keyring,
        gameRepo,
        rsvpRepo,
        playerRepo,
        vouchRepo,
        gameService,
        rsvpService,
        trustEngine
    };
}

export function registerGameCommands(program: Command): void {
    const game = program
        .command("game")
        .description("Manage game listings");

    game
        .command("create")
        .description("Create a new game listing")
        .option("--type <type>", "Game type (holdem, omaha, plo, mixed, other)")
        .option("--stakes <stakes>", "Stakes range, e.g. '1/2'")
        .option("--area <area>", "General area, e.g. 'Downtown Melbourne'")
        .option("--day <day>", "Day of week, e.g. 'Friday'")
        .option("--seats <n>", "Seats available")
        .option("--days-active <n>", "Days until the listing expires", "7")
        .option("--address <address>", "Private street address (encrypted to trusted players)")
        .option("--time <time>", "Private exact time (encrypted)")
        .option("--contact <contact>", "Private host contact (encrypted)")
        .option("--rules <rules>", "Private house rules (encrypted)")
        .action(async (options) => {
            const deps = await withUnlockedKeyring();
            if (!deps) return;

            const answers = await inquirer.prompt([
                {
                    type: "list",
                    name: "gameType",
                    message: "Game type:",
                    choices: VALID_GAME_TYPES,
                    when: () => !options.type || !VALID_GAME_TYPES.includes(options.type)
                },
                {
                    type: "input",
                    name: "stakesRange",
                    message: "Stakes (e.g. 1/2):",
                    when: () => !options.stakes
                },
                {
                    type: "input",
                    name: "generalArea",
                    message: "General area (e.g. Downtown Melbourne):",
                    when: () => !options.area
                }
            ]);

            const gameType = (options.type || answers.gameType) as GameType;
            const stakesRange = (options.stakes || answers.stakesRange) as string;
            const generalArea = (options.area || answers.generalArea) as string;

            if (!stakesRange || !generalArea) {
                output.error("Stakes and area are required.");
                deps.db.close();
                return;
            }

            const publicData: GamePublicData = {
                gameType,
                stakesRange,
                generalArea,
                hostFingerprint: deps.keyring.getFingerprint()!,
                dayOfWeek: options.day,
                seatsAvailable: options.seats ? parseInt(options.seats, 10) : undefined
            };

            const privateData: GamePrivateData | undefined =
                options.address || options.time || options.contact || options.rules
                    ? {
                          address: options.address || "",
                          exactTime: options.time || "",
                          hostContact: options.contact || "",
                          houseRules: options.rules
                      }
                    : undefined;

            const days = Math.max(1, parseInt(options.daysActive, 10) || 7);
            const expiresAt = addDays(timestampNow(), days);

            const spinner = ora("Creating game listing...").start();
            try {
                const listing = await deps.gameService.createListing({
                    publicData,
                    privateData,
                    expiresAt
                });
                spinner.succeed("Game listing created!");
                console.log();
                console.log(`Listing ID:   ${listing.listingId}`);
                console.log(`Type:         ${gameType}`);
                console.log(`Stakes:       ${stakesRange}`);
                console.log(`Area:         ${generalArea}`);
                console.log(`Expires:      ${output.formatTimestamp(listing.expiresAt)}`);
                if (privateData) {
                    console.log();
                    output.info("Private details encrypted to your current trusted set.");
                }
                console.log();
                output.dim("Run 'homegames peer connect' to broadcast this listing to peers.");
            } catch (err) {
                spinner.fail("Failed to create game listing");
                output.error((err as Error).message);
            } finally {
                deps.db.close();
            }
        });

    game
        .command("list")
        .description("List available games")
        .option("--type <type>", "Filter by game type")
        .option("--stakes <stakes>", "Filter by stakes")
        .option("--area <area>", "Filter by general area (substring match)")
        .option("--day <day>", "Filter by day of week")
        .option("--min-seats <n>", "Filter by minimum seats")
        .option("--mine", "Only show listings I created")
        .option("--all", "Include expired listings")
        .action(async (options) => {
            const db = new HomeGamesDatabase();
            const gameRepo = new GameRepository(db.getConnection());
            const identityRepo = new LocalIdentityRepository(db.getConnection());

            let listings;
            if (options.mine) {
                const localIdentity = identityRepo.get();
                if (!localIdentity) {
                    output.error("No identity found.");
                    db.close();
                    return;
                }
                listings = gameRepo.getByHost(localIdentity.fingerprint, !!options.all);
            } else if (options.all) {
                listings = gameRepo.getAll();
            } else {
                listings = gameRepo.getActive();
            }

            const results = searchListings(
                listings,
                {
                    gameType: options.type,
                    stakesRange: options.stakes,
                    generalArea: options.area,
                    dayOfWeek: options.day,
                    minSeats: options.minSeats ? parseInt(options.minSeats, 10) : undefined
                },
                { includeExpired: !!options.all }
            );

            console.log();
            output.heading(options.mine ? "Your Game Listings" : "Available Games");
            console.log();

            if (results.length === 0) {
                output.info("No games match your filters.");
                db.close();
                return;
            }

            const rows = results.map(({ listing, publicData }) => [
                listing.listingId.slice(0, 12),
                publicData.gameType,
                publicData.stakesRange,
                publicData.generalArea,
                publicData.dayOfWeek || "-",
                publicData.seatsAvailable !== undefined ? String(publicData.seatsAvailable) : "-",
                output.shortenFingerprint(publicData.hostFingerprint),
                output.formatTimestamp(listing.expiresAt)
            ]);

            output.table(
                ["ID", "Type", "Stakes", "Area", "Day", "Seats", "Host", "Expires"],
                rows
            );
            db.close();
        });

    game
        .command("show")
        .description("Show details of a game")
        .argument("<listing-id>", "The game listing ID (or 12-char prefix)")
        .action(async (listingId) => {
            const db = new HomeGamesDatabase();
            const gameRepo = new GameRepository(db.getConnection());
            const playerRepo = new PlayerRepository(db.getConnection());
            const rsvpRepo = new RSVPRepository(db.getConnection());

            let listing = gameRepo.getById(listingId);
            if (!listing) {
                const all = gameRepo.getAll();
                listing = all.find((g) => g.listingId.startsWith(listingId)) || null;
            }
            if (!listing) {
                output.error("Listing not found.");
                db.close();
                return;
            }

            let publicData: GamePublicData;
            try {
                publicData = JSON.parse(listing.publicDataJson) as GamePublicData;
            } catch {
                output.error("Listing has malformed public data.");
                db.close();
                return;
            }

            console.log();
            output.heading("Game Listing");
            console.log();
            console.log(`Listing ID:    ${listing.listingId}`);
            console.log(`Type:          ${publicData.gameType}`);
            console.log(`Stakes:        ${publicData.stakesRange}`);
            console.log(`Area:          ${publicData.generalArea}`);
            if (publicData.dayOfWeek) console.log(`Day:           ${publicData.dayOfWeek}`);
            if (publicData.seatsAvailable !== undefined) console.log(`Seats:         ${publicData.seatsAvailable}`);
            console.log(`Host:          ${output.shortenFingerprint(publicData.hostFingerprint)}`);
            console.log(`Created:       ${output.formatTimestamp(listing.createdAt)}`);
            console.log(`Expires:       ${output.formatTimestamp(listing.expiresAt)}`);

            const rsvps = rsvpRepo.getByGame(listing.listingId);
            const identityRepo = new LocalIdentityRepository(db.getConnection());
            const localIdentity = identityRepo.get();
            const isHost = localIdentity?.fingerprint === listing.hostFingerprint;

            if (isHost && rsvps.length > 0) {
                console.log();
                output.heading("RSVPs");
                for (const r of rsvps) {
                    console.log(`  ${output.shortenFingerprint(r.playerFingerprint)}  ${r.status}  ${output.formatTimestamp(r.timestamp)}`);
                }
            }

            if (!listing.encryptedDataBlob) {
                console.log();
                output.dim("This listing has no private details.");
                db.close();
                return;
            }

            console.log();
            output.info("Decrypting private details...");

            if (!localIdentity) {
                output.warn("Cannot decrypt: no local identity.");
                db.close();
                return;
            }

            const passphrase = await askPassphrase();
            let privateKeyArmored: string;
            try {
                privateKeyArmored = await decryptSymmetric(localIdentity.privateKeyEncrypted, passphrase);
            } catch {
                output.error("Invalid passphrase.");
                db.close();
                return;
            }

            try {
                const encryptedKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
                const privateKey = await openpgp.decryptKey({ privateKey: encryptedKey, passphrase });

                const host = playerRepo.getByFingerprint(listing.hostFingerprint);
                const hostKey = host ? await openpgp.readKey({ armoredKey: host.publicKeyArmored }) : undefined;

                const { data: privateData, signatureVerified } = await decryptPrivateData(
                    listing.encryptedDataBlob,
                    privateKey,
                    hostKey
                );

                console.log();
                output.heading("Private Details");
                console.log(`Address:       ${privateData.address}`);
                console.log(`Exact Time:    ${privateData.exactTime}`);
                console.log(`Contact:       ${privateData.hostContact}`);
                if (privateData.houseRules) console.log(`House Rules:   ${privateData.houseRules}`);
                if (signatureVerified === false) {
                    console.log();
                    output.warn("Host signature did not verify.");
                }
            } catch {
                output.warn("You don't have access — this listing is not encrypted to your key.");
                output.dim("You need 3+ vouches from trusted players before hosts will encrypt to you.");
            }

            db.close();
        });

    game
        .command("rsvp")
        .description("RSVP to a game")
        .argument("<listing-id>", "The game listing ID (or 12-char prefix)")
        .action(async (listingId) => {
            const deps = await withUnlockedKeyring();
            if (!deps) return;

            let listing = deps.gameRepo.getById(listingId);
            if (!listing) {
                const all = deps.gameRepo.getAll();
                listing = all.find((g) => g.listingId.startsWith(listingId)) || null;
            }
            if (!listing) {
                output.error("Listing not found.");
                deps.db.close();
                return;
            }

            try {
                const signed = await deps.rsvpService.requestRSVP(listing.listingId);
                output.success("RSVP recorded.");
                console.log();
                console.log(`RSVP ID:    ${signed.rsvp.id}`);
                console.log(`Status:     ${signed.rsvp.status}`);
                console.log();
                output.dim("Run 'homegames peer connect' to deliver the RSVP to the host.");
            } catch (err) {
                output.error((err as Error).message);
            } finally {
                deps.db.close();
            }
        });

    game
        .command("cancel")
        .description("Cancel a game listing")
        .argument("<listing-id>", "The game listing ID (or 12-char prefix)")
        .action(async (listingId) => {
            const deps = await withUnlockedKeyring();
            if (!deps) return;

            let listing = deps.gameRepo.getById(listingId);
            if (!listing) {
                const all = deps.gameRepo.getAll();
                listing = all.find((g) => g.listingId.startsWith(listingId)) || null;
            }
            if (!listing) {
                output.error("Listing not found.");
                deps.db.close();
                return;
            }

            try {
                deps.gameService.delete(listing.listingId);
                deps.rsvpRepo.deleteByGame(listing.listingId);
                output.success("Listing cancelled locally.");
                output.dim("Run 'homegames peer connect' to broadcast the delist to peers.");
            } catch (err) {
                output.error((err as Error).message);
            } finally {
                deps.db.close();
            }
        });
}
