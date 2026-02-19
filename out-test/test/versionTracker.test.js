"use strict";
// ============================================================
// src/test/versionTracker.test.ts
// Unit tests for versionParser utilities and the core logic
// of ContractVersionTracker (sans VS Code runtime dependency).
//
// Run with:  node out/test/versionTracker.test.js
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
const assert = require('assert');
const versionParser_1 = require("../utils/versionParser");
// ── versionParser tests ───────────────────────────────────────
async function testParsesSemver() {
    const v = (0, versionParser_1.parseVersion)('1.2.3');
    assert.ok(v, 'should parse 1.2.3');
    assert.strictEqual(v.major, 1);
    assert.strictEqual(v.minor, 2);
    assert.strictEqual(v.patch, 3);
    assert.strictEqual(v.preRelease, undefined);
    assert.strictEqual(v.buildMeta, undefined);
    console.log('  [ok] parses plain semver 1.2.3');
}
async function testParsesPreRelease() {
    const v = (0, versionParser_1.parseVersion)('2.0.0-alpha.1');
    assert.ok(v, 'should parse pre-release');
    assert.strictEqual(v.major, 2);
    assert.strictEqual(v.minor, 0);
    assert.strictEqual(v.patch, 0);
    assert.strictEqual(v.preRelease, 'alpha.1');
    console.log('  [ok] parses pre-release version 2.0.0-alpha.1');
}
async function testParsesPreReleaseAndBuildMeta() {
    const v = (0, versionParser_1.parseVersion)('1.0.0-beta.2+build.42');
    assert.ok(v, 'should parse pre-release + build meta');
    assert.strictEqual(v.preRelease, 'beta.2');
    assert.strictEqual(v.buildMeta, 'build.42');
    console.log('  [ok] parses pre-release + build metadata');
}
async function testParsesTwoPartVersion() {
    const v = (0, versionParser_1.parseVersion)('3.1');
    assert.ok(v, 'should parse two-part version');
    assert.strictEqual(v.major, 3);
    assert.strictEqual(v.minor, 1);
    assert.strictEqual(v.patch, 0, 'patch defaults to 0 for two-part versions');
    console.log('  [ok] parses two-part version 3.1 (patch defaults to 0)');
}
async function testRejectsInvalidVersions() {
    assert.strictEqual((0, versionParser_1.parseVersion)(''), undefined, 'empty string');
    assert.strictEqual((0, versionParser_1.parseVersion)('not-a-ver'), undefined, 'not-a-ver');
    assert.strictEqual((0, versionParser_1.parseVersion)('v1.2.3'), undefined, 'v-prefixed (not supported)');
    console.log('  [ok] rejects invalid version strings');
}
async function testIsValidVersion() {
    assert.strictEqual((0, versionParser_1.isValidVersion)('0.1.0'), true);
    assert.strictEqual((0, versionParser_1.isValidVersion)('1.0.0-rc.1'), true);
    assert.strictEqual((0, versionParser_1.isValidVersion)('bad'), false);
    assert.strictEqual((0, versionParser_1.isValidVersion)(''), false);
    console.log('  [ok] isValidVersion() correctly identifies valid/invalid strings');
}
async function testExtractVersionFromCargoToml() {
    const basic = `
[package]
name = "my-contract"
version = "0.4.2"
edition = "2021"
`;
    assert.strictEqual((0, versionParser_1.extractVersionFromCargoToml)(basic), '0.4.2');
    const singleQuotes = `version = '1.0.0-alpha'`;
    assert.strictEqual((0, versionParser_1.extractVersionFromCargoToml)(singleQuotes), '1.0.0-alpha');
    const noVersion = `[package]\nname = "foo"`;
    assert.strictEqual((0, versionParser_1.extractVersionFromCargoToml)(noVersion), undefined);
    console.log('  [ok] extractVersionFromCargoToml() handles double-quotes, single-quotes, and missing field');
}
async function testCompareVersions() {
    const major1 = (0, versionParser_1.parseVersion)('2.0.0');
    const major2 = (0, versionParser_1.parseVersion)('1.9.9');
    assert.strictEqual((0, versionParser_1.compareVersions)(major1, major2), 'greater');
    assert.strictEqual((0, versionParser_1.compareVersions)(major2, major1), 'lesser');
    const equal1 = (0, versionParser_1.parseVersion)('1.2.3');
    const equal2 = (0, versionParser_1.parseVersion)('1.2.3');
    assert.strictEqual((0, versionParser_1.compareVersions)(equal1, equal2), 'equal');
    const minor1 = (0, versionParser_1.parseVersion)('1.3.0');
    const minor2 = (0, versionParser_1.parseVersion)('1.2.9');
    assert.strictEqual((0, versionParser_1.compareVersions)(minor1, minor2), 'greater');
    console.log('  [ok] compareVersions() handles major, minor, patch precedence');
}
async function testPreReleasePrecedence() {
    // release > pre-release (semver rule)
    const release = (0, versionParser_1.parseVersion)('1.0.0');
    const preRelease = (0, versionParser_1.parseVersion)('1.0.0-alpha');
    assert.strictEqual((0, versionParser_1.compareVersions)(release, preRelease), 'greater', 'release > pre-release');
    assert.strictEqual((0, versionParser_1.compareVersions)(preRelease, release), 'lesser', 'pre-release < release');
    // numeric pre-release identifiers compared numerically
    const alpha1 = (0, versionParser_1.parseVersion)('1.0.0-alpha.1');
    const alpha2 = (0, versionParser_1.parseVersion)('1.0.0-alpha.2');
    assert.strictEqual((0, versionParser_1.compareVersions)(alpha2, alpha1), 'greater');
    console.log('  [ok] compareVersions() applies correct pre-release precedence');
}
async function testCompareVersionStrings() {
    const detail = (0, versionParser_1.compareVersionStrings)('2.0.0', '1.5.0');
    assert.strictEqual(detail.result, 'greater');
    assert.strictEqual(detail.majorChange, true);
    assert.strictEqual(detail.minorChange, false);
    assert.ok(detail.description.includes('major bump'));
    const patchDetail = (0, versionParser_1.compareVersionStrings)('1.0.1', '1.0.0');
    assert.strictEqual(patchDetail.result, 'greater');
    assert.strictEqual(patchDetail.patchChange, true);
    assert.ok(patchDetail.description.includes('patch bump'));
    const equal = (0, versionParser_1.compareVersionStrings)('1.0.0', '1.0.0');
    assert.strictEqual(equal.result, 'equal');
    console.log('  [ok] compareVersionStrings() returns detailed bump information');
}
async function testCompareVersionStringsWithInvalidInput() {
    const detail = (0, versionParser_1.compareVersionStrings)('not-valid', '1.0.0');
    // Should degrade gracefully and return equal with an explanatory message.
    assert.strictEqual(detail.result, 'equal');
    assert.ok(detail.description.includes('Cannot compare'));
    console.log('  [ok] compareVersionStrings() degrades gracefully for invalid input');
}
async function testIsNewerVersion() {
    assert.strictEqual((0, versionParser_1.isNewerVersion)('1.1.0', '1.0.0'), true);
    assert.strictEqual((0, versionParser_1.isNewerVersion)('1.0.0', '1.1.0'), false);
    assert.strictEqual((0, versionParser_1.isNewerVersion)('1.0.0', '1.0.0'), false);
    console.log('  [ok] isNewerVersion() correctly identifies newer versions');
}
async function testSortVersions() {
    const input = ['1.0.0', '0.1.0', '2.0.0', '1.5.3', '0.9.9'];
    const sorted = (0, versionParser_1.sortVersions)(input);
    assert.deepStrictEqual(sorted, ['0.1.0', '0.9.9', '1.0.0', '1.5.3', '2.0.0']);
    console.log('  [ok] sortVersions() returns ascending order');
}
async function testSortVersionsWithPreRelease() {
    const input = ['1.0.0', '1.0.0-rc.1', '1.0.0-alpha'];
    const sorted = (0, versionParser_1.sortVersions)(input);
    // pre-release < release; alpha < rc (lexicographic)
    assert.strictEqual(sorted[sorted.length - 1], '1.0.0', 'release version should be last');
    console.log('  [ok] sortVersions() places pre-release before release');
}
async function testDetectVersionMismatch() {
    // deployed is newer → mismatch
    assert.strictEqual((0, versionParser_1.detectVersionMismatch)('1.0.0', '1.1.0'), true, 'deployed 1.1.0 > local 1.0.0 is a mismatch');
    // local is newer → no mismatch (normal upgrade path)
    assert.strictEqual((0, versionParser_1.detectVersionMismatch)('1.1.0', '1.0.0'), false, 'local 1.1.0 > deployed 1.0.0 is NOT a mismatch');
    // equal → no mismatch
    assert.strictEqual((0, versionParser_1.detectVersionMismatch)('1.0.0', '1.0.0'), false, 'equal versions are not a mismatch');
    console.log('  [ok] detectVersionMismatch() correctly identifies rollback-style mismatches');
}
async function testFormatVersion() {
    const v = (0, versionParser_1.parseVersion)('3.2.1-beta.1+20260220');
    assert.ok(v);
    assert.strictEqual((0, versionParser_1.formatVersion)(v), '3.2.1-beta.1+20260220');
    const plain = (0, versionParser_1.parseVersion)('1.0.0');
    assert.ok(plain);
    assert.strictEqual((0, versionParser_1.formatVersion)(plain), '1.0.0');
    console.log('  [ok] formatVersion() reconstructs canonical version strings');
}
// ── ContractVersionTracker in-memory smoke tests ──────────────
//
// We test the tracker without a real VS Code extension context by
// providing a minimal in-memory mock that satisfies the subset of
// ExtensionContext used by ContractVersionTracker.
function createMockContext() {
    const store = {};
    return {
        workspaceState: {
            get(key, defaultValue) {
                return key in store ? store[key] : defaultValue;
            },
            async update(key, value) {
                store[key] = value;
            },
        },
    };
}
async function testTrackerRecordsDeployedVersion() {
    const { ContractVersionTracker } = await Promise.resolve().then(() => __importStar(require('../services/contractVersionTracker')));
    const ctx = createMockContext();
    const tracker = new ContractVersionTracker(ctx);
    const entry = await tracker.recordDeployedVersion('/workspace/my-contract/Cargo.toml', 'my-contract', '1.0.0', { contractId: 'CXXX', network: 'testnet', source: 'dev', label: 'First deployment' });
    assert.strictEqual(entry.version, '1.0.0');
    assert.strictEqual(entry.isDeployed, true);
    assert.strictEqual(entry.label, 'First deployment');
    assert.ok(entry.id, 'entry should have an id');
    assert.ok(entry.recordedAt, 'entry should have a recordedAt timestamp');
    console.log('  [ok] tracker records deployed version');
}
async function testTrackerMaintainsHistory() {
    const { ContractVersionTracker } = await Promise.resolve().then(() => __importStar(require('../services/contractVersionTracker')));
    const ctx = createMockContext();
    const tracker = new ContractVersionTracker(ctx);
    const cPath = '/workspace/my-contract/Cargo.toml';
    await tracker.recordLocalVersion(cPath, 'my-contract', '1.0.0', 'Initial source');
    await tracker.recordDeployedVersion(cPath, 'my-contract', '1.0.0', { network: 'testnet' });
    await tracker.recordLocalVersion(cPath, 'my-contract', '1.1.0', 'Feature bump');
    const history = tracker.getVersionHistory(cPath);
    assert.strictEqual(history.length, 3, 'three history entries expected');
    assert.strictEqual(history[0].version, '1.0.0');
    assert.strictEqual(history[1].version, '1.0.0');
    assert.strictEqual(history[2].version, '1.1.0');
    console.log('  [ok] tracker maintains ordered version history');
}
async function testTrackerTagsVersion() {
    const { ContractVersionTracker } = await Promise.resolve().then(() => __importStar(require('../services/contractVersionTracker')));
    const ctx = createMockContext();
    const tracker = new ContractVersionTracker(ctx);
    const cPath = '/workspace/my-contract/Cargo.toml';
    const entry = await tracker.recordDeployedVersion(cPath, 'my-contract', '2.0.0');
    const ok = await tracker.tagVersion(cPath, entry.id, 'Major refactor release');
    assert.strictEqual(ok, true, 'tagging should succeed');
    const history = tracker.getVersionHistory(cPath);
    assert.strictEqual(history[0].label, 'Major refactor release');
    console.log('  [ok] tracker tags a version entry');
}
async function testTrackerTagsVersionReturnsFalseForUnknownEntry() {
    const { ContractVersionTracker } = await Promise.resolve().then(() => __importStar(require('../services/contractVersionTracker')));
    const ctx = createMockContext();
    const tracker = new ContractVersionTracker(ctx);
    const cPath = '/workspace/my-contract/Cargo.toml';
    await tracker.recordDeployedVersion(cPath, 'my-contract', '1.0.0');
    const ok = await tracker.tagVersion(cPath, 'nonexistent-id', 'Should not work');
    assert.strictEqual(ok, false, 'tagging unknown entry should return false');
    console.log('  [ok] tracker rejects tag for unknown history entry');
}
async function testTrackerClearsHistory() {
    const { ContractVersionTracker } = await Promise.resolve().then(() => __importStar(require('../services/contractVersionTracker')));
    const ctx = createMockContext();
    const tracker = new ContractVersionTracker(ctx);
    const cPath = '/workspace/my-contract/Cargo.toml';
    await tracker.recordDeployedVersion(cPath, 'my-contract', '1.0.0');
    await tracker.recordDeployedVersion(cPath, 'my-contract', '1.1.0');
    await tracker.clearVersionHistory(cPath);
    const history = tracker.getVersionHistory(cPath);
    assert.strictEqual(history.length, 0, 'history should be empty after clearing');
    console.log('  [ok] tracker clears version history');
}
async function testTrackerDetectsMismatchViaState() {
    const { ContractVersionTracker } = await Promise.resolve().then(() => __importStar(require('../services/contractVersionTracker')));
    const ctx = createMockContext();
    const tracker = new ContractVersionTracker(ctx);
    const cPath = '/workspace/my-contract/Cargo.toml';
    // Record deployed version 1.1.0 (deployed is NEWER than local 1.0.0 → mismatch)
    await tracker.recordDeployedVersion(cPath, 'my-contract', '1.1.0', { network: 'testnet' });
    // Manually inject localVersion check by requesting state
    // We cannot read a real Cargo.toml here, so we verify consistency logic via getMismatches.
    // The state will show deployedVersion 1.1.0, localVersion undefined (no Cargo.toml on disk).
    // No local version → no mismatch (we need both sides to compare).
    const state = tracker.getContractVersionState(cPath, 'my-contract');
    assert.strictEqual(state.deployedVersion, '1.1.0');
    assert.strictEqual(state.hasMismatch, false, 'no mismatch when local version cannot be read');
    console.log('  [ok] tracker does not report mismatch when local version is unavailable');
}
async function testTrackerCompareVersions() {
    const { ContractVersionTracker } = await Promise.resolve().then(() => __importStar(require('../services/contractVersionTracker')));
    const ctx = createMockContext();
    const tracker = new ContractVersionTracker(ctx);
    const detail = tracker.compareVersions('1.2.0', '1.1.0');
    assert.strictEqual(detail.result, 'greater');
    assert.strictEqual(detail.minorChange, true);
    console.log('  [ok] tracker.compareVersions() delegates to versionParser correctly');
}
// ── Runner ────────────────────────────────────────────────────
async function run() {
    const tests = [
        // versionParser
        testParsesSemver,
        testParsesPreRelease,
        testParsesPreReleaseAndBuildMeta,
        testParsesTwoPartVersion,
        testRejectsInvalidVersions,
        testIsValidVersion,
        testExtractVersionFromCargoToml,
        testCompareVersions,
        testPreReleasePrecedence,
        testCompareVersionStrings,
        testCompareVersionStringsWithInvalidInput,
        testIsNewerVersion,
        testSortVersions,
        testSortVersionsWithPreRelease,
        testDetectVersionMismatch,
        testFormatVersion,
        // ContractVersionTracker
        testTrackerRecordsDeployedVersion,
        testTrackerMaintainsHistory,
        testTrackerTagsVersion,
        testTrackerTagsVersionReturnsFalseForUnknownEntry,
        testTrackerClearsHistory,
        testTrackerDetectsMismatchViaState,
        testTrackerCompareVersions,
    ];
    let passed = 0;
    let failed = 0;
    console.log('\nversionTracker unit tests');
    for (const test of tests) {
        try {
            await test();
            passed += 1;
        }
        catch (err) {
            failed += 1;
            console.error(`  [fail] ${test.name}`);
            console.error(`         ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exitCode = 1;
    }
}
run().catch(err => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});
