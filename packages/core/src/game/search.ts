import { GameListing, GamePublicData, GameFilters } from "../types/index.js";
import { isExpired } from "../crypto/utils.js";

export interface SearchResult {
    listing: GameListing;
    publicData: GamePublicData;
}

export function searchListings(
    listings: GameListing[],
    filters: GameFilters = {},
    options: { includeExpired?: boolean } = {}
): SearchResult[] {
    const results: SearchResult[] = [];

    for (const listing of listings) {
        if (!options.includeExpired && isExpired(listing.expiresAt)) continue;

        let publicData: GamePublicData;
        try {
            publicData = JSON.parse(listing.publicDataJson) as GamePublicData;
        } catch {
            continue;
        }

        if (filters.gameType && publicData.gameType !== filters.gameType) continue;
        if (filters.stakesRange && publicData.stakesRange !== filters.stakesRange) continue;
        if (filters.generalArea &&
            !publicData.generalArea.toLowerCase().includes(filters.generalArea.toLowerCase())) continue;
        if (filters.dayOfWeek && publicData.dayOfWeek !== filters.dayOfWeek) continue;
        if (filters.minSeats !== undefined &&
            (publicData.seatsAvailable ?? 0) < filters.minSeats) continue;

        results.push({ listing, publicData });
    }

    return results;
}
