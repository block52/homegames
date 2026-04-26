import { Command } from "commander";
import * as output from "../utils/output.js";

export function registerGameCommands(program: Command): void {
    const game = program
        .command("game")
        .description("Manage game listings (Phase 2)");

    game
        .command("list")
        .description("List available games")
        .option("--type <type>", "Filter by game type (holdem, omaha, plo, mixed)")
        .option("--stakes <stakes>", "Filter by stakes (e.g., '1/2', '2/5')")
        .option("--area <area>", "Filter by general area")
        .action(async (_options) => {
            output.warn("Game listings will be implemented in Phase 2.");
            console.log();
            output.info("In Phase 2, you will be able to:");
            console.log("  - Browse games from trusted hosts");
            console.log("  - See encrypted location details (if you have 3+ vouches)");
            console.log("  - RSVP to games");
            console.log("  - Receive notifications about new games");
        });

    game
        .command("create")
        .description("Create a new game listing")
        .action(async () => {
            output.warn("Game creation will be implemented in Phase 2.");
            console.log();
            output.info("In Phase 2, you will be able to:");
            console.log("  - Create game listings with public info (stakes, type, area)");
            console.log("  - Add encrypted details (location, time) for trusted players");
            console.log("  - Set minimum trust level requirements");
            console.log("  - Manage RSVPs from other players");
        });

    game
        .command("show")
        .description("Show details of a game")
        .argument("<listing-id>", "The game listing ID")
        .action(async (_listingId) => {
            output.warn("Game details will be implemented in Phase 2.");
        });

    game
        .command("rsvp")
        .description("RSVP to a game")
        .argument("<listing-id>", "The game listing ID")
        .action(async (_listingId) => {
            output.warn("RSVP functionality will be implemented in Phase 2.");
        });

    game
        .command("cancel")
        .description("Cancel a game listing")
        .argument("<listing-id>", "The game listing ID to cancel")
        .action(async (_listingId) => {
            output.warn("Game cancellation will be implemented in Phase 2.");
        });
}
