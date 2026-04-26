import { Vouch } from "../types/index.js";
import { VouchRepository } from "../storage/repositories/vouches.js";
import { PlayerRepository } from "../storage/repositories/players.js";

export interface TrustGraphNode {
    fingerprint: string;
    nickname?: string;
    trustStatus: string;
    vouchesReceived: number;
    vouchesGiven: number;
}

export interface TrustGraphEdge {
    from: string;
    to: string;
    trustLevel: number;
    timestamp: number;
}

export interface TrustGraph {
    nodes: TrustGraphNode[];
    edges: TrustGraphEdge[];
}

export class TrustGraphService {
    constructor(
        private vouchRepo: VouchRepository,
        private playerRepo: PlayerRepository
    ) {}

    buildGraph(): TrustGraph {
        const players = this.playerRepo.getAll();
        const vouches = this.vouchRepo.getAll(false);

        const vouchesReceivedCount = new Map<string, number>();
        const vouchesGivenCount = new Map<string, number>();

        for (const vouch of vouches) {
            vouchesReceivedCount.set(
                vouch.voucheeGpgFingerprint,
                (vouchesReceivedCount.get(vouch.voucheeGpgFingerprint) || 0) + 1
            );
            vouchesGivenCount.set(
                vouch.voucherGpgFingerprint,
                (vouchesGivenCount.get(vouch.voucherGpgFingerprint) || 0) + 1
            );
        }

        const nodes: TrustGraphNode[] = players.map(player => {
            let nickname: string | undefined;
            if (player.profileJson) {
                try {
                    const profile = JSON.parse(player.profileJson);
                    nickname = profile.nickname;
                } catch {
                    // ignore
                }
            }

            return {
                fingerprint: player.gpgFingerprint,
                nickname,
                trustStatus: player.trustStatus,
                vouchesReceived: vouchesReceivedCount.get(player.gpgFingerprint) || 0,
                vouchesGiven: vouchesGivenCount.get(player.gpgFingerprint) || 0
            };
        });

        const edges: TrustGraphEdge[] = vouches.map(vouch => ({
            from: vouch.voucherGpgFingerprint,
            to: vouch.voucheeGpgFingerprint,
            trustLevel: vouch.trustLevel,
            timestamp: vouch.timestamp
        }));

        return { nodes, edges };
    }

    getVouchPath(fromFingerprint: string, toFingerprint: string): string[][] {
        const graph = this.buildGraph();
        const adjacency = new Map<string, string[]>();

        for (const edge of graph.edges) {
            if (!adjacency.has(edge.from)) {
                adjacency.set(edge.from, []);
            }
            adjacency.get(edge.from)!.push(edge.to);
        }

        const paths: string[][] = [];
        const visited = new Set<string>();

        const dfs = (current: string, path: string[]): void => {
            if (current === toFingerprint) {
                paths.push([...path]);
                return;
            }

            if (path.length > 5) return; // Limit path length
            if (visited.has(current)) return;

            visited.add(current);
            const neighbors = adjacency.get(current) || [];

            for (const neighbor of neighbors) {
                dfs(neighbor, [...path, neighbor]);
            }

            visited.delete(current);
        };

        dfs(fromFingerprint, [fromFingerprint]);
        return paths;
    }

    getMutualVouches(): Array<{ player1: string; player2: string }> {
        const vouches = this.vouchRepo.getAll(false);
        const vouchSet = new Set<string>();
        const mutualVouches: Array<{ player1: string; player2: string }> = [];

        for (const vouch of vouches) {
            const key = `${vouch.voucherGpgFingerprint}->${vouch.voucheeGpgFingerprint}`;
            vouchSet.add(key);
        }

        for (const vouch of vouches) {
            const reverseKey = `${vouch.voucheeGpgFingerprint}->${vouch.voucherGpgFingerprint}`;
            if (vouchSet.has(reverseKey)) {
                // Avoid duplicates by only adding when fingerprint1 < fingerprint2
                if (vouch.voucherGpgFingerprint < vouch.voucheeGpgFingerprint) {
                    mutualVouches.push({
                        player1: vouch.voucherGpgFingerprint,
                        player2: vouch.voucheeGpgFingerprint
                    });
                }
            }
        }

        return mutualVouches;
    }

    getIsolatedPlayers(): string[] {
        const players = this.playerRepo.getAll();
        const vouches = this.vouchRepo.getAll(false);

        const connectedPlayers = new Set<string>();
        for (const vouch of vouches) {
            connectedPlayers.add(vouch.voucherGpgFingerprint);
            connectedPlayers.add(vouch.voucheeGpgFingerprint);
        }

        return players
            .filter(p => !connectedPlayers.has(p.gpgFingerprint))
            .map(p => p.gpgFingerprint);
    }

    getStats(): {
        totalPlayers: number;
        trustedPlayers: number;
        totalVouches: number;
        averageVouchesPerPlayer: number;
        mutualVouchCount: number;
    } {
        const players = this.playerRepo.getAll();
        const trustedPlayers = players.filter(p => p.trustStatus === "trusted").length;
        const vouches = this.vouchRepo.getAll(false);
        const mutualVouches = this.getMutualVouches();

        return {
            totalPlayers: players.length,
            trustedPlayers,
            totalVouches: vouches.length,
            averageVouchesPerPlayer: players.length > 0 ? vouches.length / players.length : 0,
            mutualVouchCount: mutualVouches.length
        };
    }
}
