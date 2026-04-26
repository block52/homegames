import * as openpgp from "openpgp";
import { GamePrivateData } from "../types/index.js";
import { encryptToMultipleRecipients, decrypt } from "../crypto/encrypt.js";

export interface EncryptedRecipient {
    fingerprint: string;
    publicKeyArmored: string;
}

export async function encryptPrivateData(
    data: GamePrivateData,
    recipients: EncryptedRecipient[],
    signingKey: openpgp.PrivateKey
): Promise<string> {
    if (recipients.length === 0) {
        throw new Error("Cannot encrypt private data: no trusted recipients available.");
    }

    const recipientKeys = await Promise.all(
        recipients.map((r) => openpgp.readKey({ armoredKey: r.publicKeyArmored }))
    );

    const plaintext = JSON.stringify(data);
    return encryptToMultipleRecipients(plaintext, recipientKeys, signingKey);
}

export async function decryptPrivateData(
    encryptedBlob: string,
    privateKey: openpgp.PrivateKey,
    hostPublicKey?: openpgp.PublicKey
): Promise<{ data: GamePrivateData; signatureVerified: boolean | null }> {
    const { data: plaintext, signatureVerified } = await decrypt(
        encryptedBlob,
        privateKey,
        hostPublicKey
    );
    return {
        data: JSON.parse(plaintext) as GamePrivateData,
        signatureVerified
    };
}
