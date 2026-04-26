import * as openpgp from "openpgp";
import { IdentityOptions } from "../types/index.js";

export interface GenerateKeyResult {
    publicKeyArmored: string;
    privateKeyArmored: string;
    fingerprint: string;
}

export class Keyring {
    private privateKey: openpgp.PrivateKey | null = null;
    private publicKey: openpgp.PublicKey | null = null;
    private passphraseTimeout: ReturnType<typeof setTimeout> | null = null;
    private readonly cacheTimeoutMs: number;

    constructor(cacheTimeoutMs = 300000) {
        this.cacheTimeoutMs = cacheTimeoutMs;
    }

    async generateKey(options: IdentityOptions): Promise<GenerateKeyResult> {
        const keyType = options.keyType || "ecc";
        const userIDs = [{
            name: options.name || "HomeGames Player",
            email: options.email
        }];

        let result: { privateKey: string; publicKey: string };

        if (keyType === "ecc") {
            result = await openpgp.generateKey({
                type: "ecc",
                curve: options.curve || "ed25519",
                userIDs,
                passphrase: options.passphrase,
                format: "armored"
            });
        } else {
            result = await openpgp.generateKey({
                type: "rsa",
                rsaBits: options.rsaBits || 4096,
                userIDs,
                passphrase: options.passphrase,
                format: "armored"
            });
        }

        const parsedPublic = await openpgp.readKey({ armoredKey: result.publicKey });

        return {
            publicKeyArmored: result.publicKey,
            privateKeyArmored: result.privateKey,
            fingerprint: parsedPublic.getFingerprint().toUpperCase()
        };
    }

    async unlockKey(armoredPrivateKey: string, passphrase: string): Promise<void> {
        const privateKey = await openpgp.readPrivateKey({ armoredKey: armoredPrivateKey });
        this.privateKey = await openpgp.decryptKey({
            privateKey,
            passphrase
        });
        this.publicKey = this.privateKey.toPublic();

        this.resetPassphraseTimeout();
    }

    async loadPublicKey(armoredPublicKey: string): Promise<string> {
        this.publicKey = await openpgp.readKey({ armoredKey: armoredPublicKey });
        return this.publicKey.getFingerprint().toUpperCase();
    }

    async importPublicKey(armoredKey: string): Promise<{ fingerprint: string; publicKey: openpgp.PublicKey }> {
        const publicKey = await openpgp.readKey({ armoredKey });
        return {
            fingerprint: publicKey.getFingerprint().toUpperCase(),
            publicKey
        };
    }

    getPrivateKey(): openpgp.PrivateKey | null {
        return this.privateKey;
    }

    getPublicKey(): openpgp.PublicKey | null {
        return this.publicKey;
    }

    getFingerprint(): string | null {
        if (!this.publicKey) return null;
        return this.publicKey.getFingerprint().toUpperCase();
    }

    async exportPublicKey(): Promise<string | null> {
        if (!this.publicKey) return null;
        return this.publicKey.armor();
    }

    isUnlocked(): boolean {
        return this.privateKey !== null;
    }

    lock(): void {
        this.privateKey = null;
        if (this.passphraseTimeout) {
            clearTimeout(this.passphraseTimeout);
            this.passphraseTimeout = null;
        }
    }

    private resetPassphraseTimeout(): void {
        if (this.passphraseTimeout) {
            clearTimeout(this.passphraseTimeout);
        }
        this.passphraseTimeout = setTimeout(() => {
            this.lock();
        }, this.cacheTimeoutMs);
    }
}
