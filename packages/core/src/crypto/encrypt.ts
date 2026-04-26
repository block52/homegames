import * as openpgp from "openpgp";

export async function encryptToRecipient(
    data: string,
    recipientPublicKey: openpgp.PublicKey,
    signingKey?: openpgp.PrivateKey
): Promise<string> {
    const message = await openpgp.createMessage({ text: data });

    const encrypted = await openpgp.encrypt({
        message,
        encryptionKeys: recipientPublicKey,
        signingKeys: signingKey
    });

    return encrypted as string;
}

export async function encryptToMultipleRecipients(
    data: string,
    recipientPublicKeys: openpgp.PublicKey[],
    signingKey?: openpgp.PrivateKey
): Promise<string> {
    const message = await openpgp.createMessage({ text: data });

    const encrypted = await openpgp.encrypt({
        message,
        encryptionKeys: recipientPublicKeys,
        signingKeys: signingKey
    });

    return encrypted as string;
}

export async function decrypt(
    encryptedData: string,
    privateKey: openpgp.PrivateKey,
    senderPublicKey?: openpgp.PublicKey
): Promise<{ data: string; signatureVerified: boolean | null }> {
    const message = await openpgp.readMessage({ armoredMessage: encryptedData });

    const { data, signatures } = await openpgp.decrypt({
        message,
        decryptionKeys: privateKey,
        verificationKeys: senderPublicKey
    });

    let signatureVerified: boolean | null = null;
    if (senderPublicKey && signatures.length > 0) {
        try {
            await signatures[0].verified;
            signatureVerified = true;
        } catch {
            signatureVerified = false;
        }
    }

    return {
        data: data as string,
        signatureVerified
    };
}

export async function encryptSymmetric(
    data: string,
    passphrase: string
): Promise<string> {
    const message = await openpgp.createMessage({ text: data });

    const encrypted = await openpgp.encrypt({
        message,
        passwords: [passphrase]
    });

    return encrypted as string;
}

export async function decryptSymmetric(
    encryptedData: string,
    passphrase: string
): Promise<string> {
    const message = await openpgp.readMessage({ armoredMessage: encryptedData });

    const { data } = await openpgp.decrypt({
        message,
        passwords: [passphrase]
    });

    return data as string;
}
