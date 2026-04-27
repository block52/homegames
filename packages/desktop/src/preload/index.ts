import { contextBridge, ipcRenderer } from "electron";
import type { HomeGamesAPI } from "../shared/api.js";

const api: HomeGamesAPI = {
    identity: {
        get: () => ipcRenderer.invoke("identity:get"),
        create: (params) => ipcRenderer.invoke("identity:create", params),
        delete: () => ipcRenderer.invoke("identity:delete")
    },
    keyring: {
        unlock: (passphrase) => ipcRenderer.invoke("keyring:unlock", passphrase),
        lock: () => ipcRenderer.invoke("keyring:lock"),
        status: () => ipcRenderer.invoke("keyring:status")
    },
    peers: {
        list: () => ipcRenderer.invoke("peers:list"),
        detail: (fingerprint) => ipcRenderer.invoke("peers:detail", fingerprint),
        previewArmored: (armored) => ipcRenderer.invoke("peers:previewArmored", armored),
        import: (armored) => ipcRenderer.invoke("peers:import", armored),
        fetchByFingerprint: (fp) => ipcRenderer.invoke("peers:fetchByFingerprint", fp)
    },
    vouches: {
        listMine: () => ipcRenderer.invoke("vouches:listMine"),
        create: (fp, level, note) => ipcRenderer.invoke("vouches:create", fp, level, note),
        revoke: (fingerprint) => ipcRenderer.invoke("vouches:revoke", fingerprint)
    },
    games: {
        list: (filters) => ipcRenderer.invoke("games:list", filters),
        create: (params) => ipcRenderer.invoke("games:create", params),
        show: (listingId) => ipcRenderer.invoke("games:show", listingId),
        rsvp: (listingId, note) => ipcRenderer.invoke("games:rsvp", listingId, note),
        cancel: (listingId) => ipcRenderer.invoke("games:cancel", listingId)
    },
    checkins: {
        createChallenge: (gameListingId) => ipcRenderer.invoke("checkins:createChallenge", gameListingId),
        signChallenge: (challenge) => ipcRenderer.invoke("checkins:signChallenge", challenge),
        verifyAndRecord: (challenge, response) => ipcRenderer.invoke("checkins:verifyAndRecord", challenge, response),
        listForGame: (gameListingId) => ipcRenderer.invoke("checkins:listForGame", gameListingId)
    }
};

contextBridge.exposeInMainWorld("homegames", api);
