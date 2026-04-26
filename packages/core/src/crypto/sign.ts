import * as openpgp from "openpgp";

export async function signData(
    data: string | Uint8Array,
    privateKey: openpgp.PrivateKey
): Promise<string> {
    const textData = typeof data === "string" ? data : new TextDecoder().decode(data);

    const message = await openpgp.createMessage({ text: textData });

    const signature = await openpgp.sign({
        message,
        signingKeys: privateKey,
        detached: true
    });

    return signature as string;
}

export async function verifySignature(
    data: string | Uint8Array,
    signature: string,
    publicKey: openpgp.PublicKey
): Promise<boolean> {
    try {
        const textData = typeof data === "string" ? data : new TextDecoder().decode(data);

        const message = await openpgp.createMessage({ text: textData });
        const signatureObj = await openpgp.readSignature({ armoredSignature: signature });

        const verificationResult = await openpgp.verify({
            message,
            signature: signatureObj,
            verificationKeys: publicKey
        });

        const { verified } = verificationResult.signatures[0];
        await verified;
        return true;
    } catch {
        return false;
    }
}

export function createSignablePayload(obj: Record<string, unknown>): string {
    const sortedKeys = Object.keys(obj).sort();
    const sortedObj: Record<string, unknown> = {};
    for (const key of sortedKeys) {
        sortedObj[key] = obj[key];
    }
    return JSON.stringify(sortedObj);
}

export async function signObject<T extends Record<string, unknown>>(
    obj: T,
    privateKey: openpgp.PrivateKey
): Promise<{ payload: string; signature: string }> {
    const payload = createSignablePayload(obj);
    const signature = await signData(payload, privateKey);
    return { payload, signature };
}

export async function verifySignedObject(
    payload: string,
    signature: string,
    publicKey: openpgp.PublicKey
): Promise<boolean> {
    return verifySignature(payload, signature, publicKey);
}
