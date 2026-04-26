/**
 * Destination Store - Persist I2P destination keys across restarts
 *
 * Stores the I2P private key so the same destination address is used
 * each time the application starts.
 */

import { ConfigRepository } from "../storage/repositories/config.js";
import { I2PDestinationWithKeys } from "./types.js";

const CONFIG_KEYS = {
    PUBLIC_DEST: "i2p.destination.public",
    PRIVATE_KEY: "i2p.destination.private",
    BASE32: "i2p.destination.base32",
    CREATED_AT: "i2p.destination.created_at"
};

export class DestinationStore {
    constructor(private configRepo: ConfigRepository) {}

    /**
     * Save an I2P destination to persistent storage
     */
    save(dest: I2PDestinationWithKeys): void {
        this.configRepo.set(CONFIG_KEYS.PUBLIC_DEST, dest.base64);
        this.configRepo.set(CONFIG_KEYS.PRIVATE_KEY, dest.privateKey);
        this.configRepo.set(CONFIG_KEYS.BASE32, dest.base32);
        this.configRepo.set(CONFIG_KEYS.CREATED_AT, Date.now().toString());
    }

    /**
     * Load the stored I2P destination
     */
    load(): I2PDestinationWithKeys | null {
        const publicDest = this.configRepo.get(CONFIG_KEYS.PUBLIC_DEST);
        const privateKey = this.configRepo.get(CONFIG_KEYS.PRIVATE_KEY);
        const base32 = this.configRepo.get(CONFIG_KEYS.BASE32);

        if (!publicDest || !privateKey || !base32) {
            return null;
        }

        return {
            base64: publicDest,
            privateKey,
            base32
        };
    }

    /**
     * Check if a destination is stored
     */
    exists(): boolean {
        return this.configRepo.get(CONFIG_KEYS.PUBLIC_DEST) !== null;
    }

    /**
     * Clear the stored destination
     */
    clear(): void {
        this.configRepo.delete(CONFIG_KEYS.PUBLIC_DEST);
        this.configRepo.delete(CONFIG_KEYS.PRIVATE_KEY);
        this.configRepo.delete(CONFIG_KEYS.BASE32);
        this.configRepo.delete(CONFIG_KEYS.CREATED_AT);
    }

    /**
     * Get the creation timestamp of the stored destination
     */
    getCreatedAt(): number | null {
        const timestamp = this.configRepo.get(CONFIG_KEYS.CREATED_AT);
        return timestamp ? parseInt(timestamp, 10) : null;
    }
}
