"use strict";
// ============================================================
// src/services/contractVersionTracker.ts
// Tracks local and deployed versions of Soroban contracts,
// maintains per-contract version history, and surfaces
// mismatch warnings.
// ============================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContractVersionTracker = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const versionParser_1 = require("../utils/versionParser");
// ── Internal persistence key ──────────────────────────────────
const STORAGE_KEY = 'stellarSuite.contractVersions';
// ── Service class ─────────────────────────────────────────────
/**
 * ContractVersionTracker is responsible for:
 * - Reading local versions from Cargo.toml
 * - Persisting deployed version snapshots in workspace state
 * - Maintaining an ordered history of version changes
 * - Comparing local vs deployed versions and reporting mismatches
 */
class ContractVersionTracker {
    constructor(context, outputChannel) {
        this.context = context;
        // Fall back to a no-op channel when running outside the VS Code host.
        this.outputChannel = outputChannel ?? {
            appendLine: (_msg) => { },
        };
    }
    // ── Public API ────────────────────────────────────────────
    /**
     * Read the version declared in `Cargo.toml` for the given contract directory.
     * `contractDir` should be the directory that contains `Cargo.toml`
     * (not the Cargo.toml path itself).
     */
    getLocalVersion(contractDir) {
        // Accept either a directory OR the Cargo.toml path itself.
        const cargoPath = contractDir.endsWith('Cargo.toml')
            ? contractDir
            : path.join(contractDir, 'Cargo.toml');
        try {
            const content = fs.readFileSync(cargoPath, 'utf-8');
            const version = (0, versionParser_1.extractVersionFromCargoToml)(content);
            if (version && !(0, versionParser_1.isValidVersion)(version)) {
                this.log(`[VersionTracker] Non-semver version "${version}" in ${cargoPath}`);
            }
            return version;
        }
        catch (err) {
            this.log(`[VersionTracker] Cannot read ${cargoPath}: ${err instanceof Error ? err.message : String(err)}`);
            return undefined;
        }
    }
    /**
     * Record a deployed version snapshot.
     * Call this immediately after a successful deployment.
     */
    async recordDeployedVersion(contractPath, contractName, version, opts) {
        const entry = {
            id: this.generateId(),
            version,
            recordedAt: new Date().toISOString(),
            isDeployed: true,
            contractId: opts?.contractId,
            network: opts?.network,
            source: opts?.source,
            label: opts?.label,
        };
        const all = this.loadAllVersionData();
        const key = this.contractKey(contractPath);
        if (!all[key]) {
            all[key] = { contractPath, contractName, history: [], deployedVersion: undefined };
        }
        all[key].history.push(entry);
        all[key].deployedVersion = version;
        all[key].contractName = contractName; // keep name up-to-date
        await this.saveAllVersionData(all);
        this.log(`[VersionTracker] Recorded deployed version ${version} for ${contractName}`);
        return entry;
    }
    /**
     * Record a local (source) version snapshot without a deployment event.
     * Useful for tracking version bumps even before deploying.
     */
    async recordLocalVersion(contractPath, contractName, version, label) {
        const entry = {
            id: this.generateId(),
            version,
            recordedAt: new Date().toISOString(),
            isDeployed: false,
            label,
        };
        const all = this.loadAllVersionData();
        const key = this.contractKey(contractPath);
        if (!all[key]) {
            all[key] = { contractPath, contractName, history: [], deployedVersion: undefined };
        }
        all[key].history.push(entry);
        all[key].contractName = contractName;
        await this.saveAllVersionData(all);
        this.log(`[VersionTracker] Recorded local version ${version} for ${contractName}`);
        return entry;
    }
    /**
     * Add or update a human-readable label on an existing history entry.
     */
    async tagVersion(contractPath, entryId, label) {
        const all = this.loadAllVersionData();
        const key = this.contractKey(contractPath);
        const state = all[key];
        if (!state) {
            return false;
        }
        const entry = state.history.find(e => e.id === entryId);
        if (!entry) {
            return false;
        }
        entry.label = label;
        await this.saveAllVersionData(all);
        this.log(`[VersionTracker] Tagged version ${entry.version} as "${label}" for ${contractPath}`);
        return true;
    }
    /**
     * Get the full version state for a contract, including mismatch detection.
     * `contractPath` may be the directory path or the Cargo.toml path.
     */
    getContractVersionState(contractPath, contractName) {
        const localVersion = this.getLocalVersion(contractPath);
        const all = this.loadAllVersionData();
        const key = this.contractKey(contractPath);
        const stored = all[key];
        const deployedVersion = stored?.deployedVersion;
        let hasMismatch = false;
        let mismatch;
        if (localVersion && deployedVersion && localVersion !== deployedVersion) {
            const comparison = (0, versionParser_1.compareVersionStrings)(localVersion, deployedVersion);
            if ((0, versionParser_1.detectVersionMismatch)(localVersion, deployedVersion)) {
                hasMismatch = true;
                mismatch = {
                    contractPath,
                    contractName,
                    localVersion,
                    deployedVersion,
                    comparison,
                    message: `Deployed version (${deployedVersion}) is NEWER than local ` +
                        `source (${localVersion}). Your workspace may be behind the ` +
                        `deployed contract.`,
                };
            }
        }
        return {
            contractPath,
            contractName,
            localVersion,
            deployedVersion,
            history: stored?.history ?? [],
            hasMismatch,
            mismatch,
        };
    }
    /**
     * Get version states for all tracked contracts.
     */
    getAllContractVersionStates() {
        const all = this.loadAllVersionData();
        return Object.values(all).map(stored => this.getContractVersionState(stored.contractPath, stored.contractName));
    }
    /**
     * Get all version mismatches across tracked contracts.
     */
    getMismatches() {
        return this.getAllContractVersionStates()
            .filter(s => s.hasMismatch && s.mismatch !== undefined)
            .map(s => s.mismatch);
    }
    /**
     * Get the version history for a single contract (oldest to newest).
     */
    getVersionHistory(contractPath) {
        const all = this.loadAllVersionData();
        const key = this.contractKey(contractPath);
        return all[key]?.history ?? [];
    }
    /**
     * Clear the entire version history for a contract.
     */
    async clearVersionHistory(contractPath) {
        const all = this.loadAllVersionData();
        const key = this.contractKey(contractPath);
        delete all[key];
        await this.saveAllVersionData(all);
        this.log(`[VersionTracker] Cleared version history for ${contractPath}`);
    }
    /**
     * Compare any two version strings and return a detailed result.
     * Thin convenience wrapper around the versionParser utility.
     */
    compareVersions(versionA, versionB) {
        return (0, versionParser_1.compareVersionStrings)(versionA, versionB);
    }
    /**
     * Emit mismatch notifications via VS Code information messages
     * for all contracts that have version conflicts.
     */
    async notifyMismatches() {
        const mismatches = this.getMismatches();
        // Lazy-require vscode so this file stays importable in plain Node.js.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const vscode = require('vscode');
        for (const m of mismatches) {
            const choice = await vscode.window.showWarningMessage(`[Stellar Suite] ${m.contractName}: ${m.message}`, 'Dismiss');
            this.log(`[VersionTracker] Mismatch notification for ${m.contractName}: ${choice ?? 'auto-dismissed'}`);
        }
    }
    // ── Persistence helpers ───────────────────────────────────
    /** Raw persisted structure (indexed by normalised contract key). */
    loadAllVersionData() {
        return this.context.workspaceState.get(STORAGE_KEY, {});
    }
    async saveAllVersionData(data) {
        await this.context.workspaceState.update(STORAGE_KEY, data);
    }
    // ── Utility helpers ───────────────────────────────────────
    /** Normalise a contract path to a stable storage key. */
    contractKey(contractPath) {
        // Normalise separators and strip trailing slash.
        return contractPath.replace(/\\/g, '/').replace(/\/$/, '');
    }
    generateId() {
        // Simple but unique enough for local storage purposes.
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
    log(msg) {
        this.outputChannel.appendLine(msg);
    }
}
exports.ContractVersionTracker = ContractVersionTracker;
