import {
    HomeGamesDatabase,
    Keyring,
    PlayerRepository,
    VouchRepository,
    GameRepository,
    RSVPRepository,
    CheckInRepository,
    LocalIdentityRepository,
    ConfigRepository,
    TrustEngine,
    VouchService,
    GameService,
    RSVPService,
    CheckInService,
    NetworkService
} from "@homegames/core";

export interface AppServices {
    db: HomeGamesDatabase;
    keyring: Keyring;
    playerRepo: PlayerRepository;
    vouchRepo: VouchRepository;
    gameRepo: GameRepository;
    rsvpRepo: RSVPRepository;
    checkinRepo: CheckInRepository;
    identityRepo: LocalIdentityRepository;
    configRepo: ConfigRepository;
    trustEngine: TrustEngine;
    vouchService: VouchService;
    gameService: GameService;
    rsvpService: RSVPService;
    checkinService: CheckInService;
    networkService: NetworkService | null;
    networkLastError: string | null;
    setNetworkService: (svc: NetworkService | null) => void;
    setNetworkLastError: (err: string | null) => void;
}

let cached: AppServices | null = null;

export function getServices(): AppServices {
    if (cached) return cached;

    const db = new HomeGamesDatabase();
    const conn = db.getConnection();

    const keyring = new Keyring();
    const playerRepo = new PlayerRepository(conn);
    const vouchRepo = new VouchRepository(conn);
    const gameRepo = new GameRepository(conn);
    const rsvpRepo = new RSVPRepository(conn);
    const checkinRepo = new CheckInRepository(conn);
    const identityRepo = new LocalIdentityRepository(conn);
    const configRepo = new ConfigRepository(conn);
    const trustEngine = new TrustEngine(vouchRepo, playerRepo);
    const vouchService = new VouchService(vouchRepo, playerRepo, keyring);
    const gameService = new GameService(gameRepo, playerRepo, trustEngine, keyring);
    const rsvpService = new RSVPService(rsvpRepo, gameRepo, playerRepo, keyring);
    const checkinService = new CheckInService(checkinRepo, gameRepo, playerRepo, keyring);

    const services: AppServices = {
        db,
        keyring,
        playerRepo,
        vouchRepo,
        gameRepo,
        rsvpRepo,
        checkinRepo,
        identityRepo,
        configRepo,
        trustEngine,
        vouchService,
        gameService,
        rsvpService,
        checkinService,
        networkService: null,
        networkLastError: null,
        setNetworkService: (svc) => {
            services.networkService = svc;
        },
        setNetworkLastError: (err) => {
            services.networkLastError = err;
        }
    };
    cached = services;

    // Eagerly load the public key so the sidebar can show your
    // fingerprint without forcing an unlock first. The private key
    // stays on disk (encrypted) until the user enters their passphrase.
    const local = identityRepo.get();
    if (local) {
        keyring.loadPublicKey(local.publicKey).catch(() => { /* ignore */ });
    }

    return cached;
}

export async function shutdownServices(): Promise<void> {
    if (cached) {
        if (cached.networkService) {
            await cached.networkService.stop().catch(() => { /* ignore */ });
            cached.networkService = null;
        }
        cached.keyring.lock();
        cached.db.close();
        cached = null;
    }
}
