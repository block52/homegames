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
    CheckInService
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

    cached = {
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
        checkinService
    };
    return cached;
}

export function shutdownServices(): void {
    if (cached) {
        cached.keyring.lock();
        cached.db.close();
        cached = null;
    }
}
