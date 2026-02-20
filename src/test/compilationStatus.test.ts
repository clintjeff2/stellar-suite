// ============================================================
// src/test/compilationStatus.test.ts
// Unit tests for compilation status monitoring.
//
// Run with:  node out-test/test/compilationStatus.test.js
// ============================================================

declare function require(name: string): any;
declare const process: { exitCode?: number };

// ── Mock vscode ───────────────────────────────────────────────

const mockVscode = {
    EventEmitter: class {
        private listeners: any[] = [];
        fire(data: any) { this.listeners.forEach(l => l(data)); }
        event = (l: any) => {
            this.listeners.push(l);
            return { dispose: () => { this.listeners = this.listeners.filter(i => i !== l); } };
        };
        dispose() { }
    },
    window: {
        createOutputChannel: () => ({
            appendLine: () => { },
            dispose: () => { }
        })
    },
    workspace: {
        onDidChangeWorkspaceFolders: () => ({ dispose: () => { } })
    },
    CompilationStatus: {
        IDLE: 'IDLE',
        IN_PROGRESS: 'IN_PROGRESS',
        SUCCESS: 'SUCCESS',
        FAILED: 'FAILED',
        WARNING: 'WARNING',
        CANCELLED: 'CANCELLED'
    }
};

// Hack to mock the 'vscode' module in Node.js
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request: string, parent: any, isMain: boolean) {
    if (request === 'vscode') {
        return mockVscode;
    }
    return originalLoad.apply(this, arguments);
};

// ── Imports ───────────────────────────────────────────────────

const assert = require('assert');
import { CompilationStatusMonitor } from '../services/compilationStatusMonitor';
import {
    CompilationStatus,
    CompilationDiagnosticSeverity,
    CompilationMonitorConfig
} from '../types/compilationStatus';

// ============================================================
// Mock Extension Context
// ============================================================

class MockExtensionContext {
    private storage: Map<string, any> = new Map();

    workspaceState = {
        get: <T>(key: string, defaultValue?: T): T | undefined => {
            return this.storage.get(key) ?? defaultValue;
        },
        update: (key: string, value: any): Promise<void> => {
            this.storage.set(key, value);
            return Promise.resolve();
        }
    };

    globalState = {
        get: <T>(key: string, defaultValue?: T): T | undefined => {
            return this.storage.get(key) ?? defaultValue;
        },
        update: (key: string, value: any): Promise<void> => {
            this.storage.set(key, value);
            return Promise.resolve();
        }
    };

    extensionUri = { fsPath: '/test/extension' } as any;
    subscriptions: any[] = [];
}

// ============================================================
// Test Implementation
// ============================================================

async function run() {
    let monitor: CompilationStatusMonitor;
    let mockContext: MockExtensionContext;
    const testContractPath = '/test/contracts/test-contract';

    const setup = () => {
        mockContext = new MockExtensionContext();
        monitor = new CompilationStatusMonitor(mockContext as any);
    };

    const teardown = () => {
        monitor.dispose();
    };

    const tests = [
        async function testStartCompilation() {
            setup();
            const event = monitor.startCompilation(testContractPath);
            assert.strictEqual(event.contractPath, testContractPath);
            assert.strictEqual(event.status, CompilationStatus.IN_PROGRESS);
            teardown();
        },
        async function testUpdateProgress() {
            setup();
            monitor.startCompilation(testContractPath);
            monitor.updateProgress(testContractPath, 50, 'Halfway done');
            const status = monitor.getCurrentStatus(testContractPath);
            assert.strictEqual(status?.progress, 50);
            teardown();
        },
        async function testReportSuccess() {
            setup();
            monitor.startCompilation(testContractPath);
            const record = monitor.reportSuccess(testContractPath, '/test/output.wasm');
            assert.strictEqual(record.status, CompilationStatus.SUCCESS);
            teardown();
        },
        async function testReportFailure() {
            setup();
            monitor.startCompilation(testContractPath);
            const record = monitor.reportFailure(testContractPath, 'Build failed', []);
            assert.strictEqual(record.status, CompilationStatus.FAILED);
            teardown();
        }
    ];

    console.log('\ncompilationStatus unit tests');
    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            await test();
            passed++;
            console.log(`  [ok] ${test.name}`);
        } catch (err) {
            failed++;
            console.error(`  [fail] ${test.name}`);
            console.error(`         ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exitCode = 1;
}

run().catch(err => {
    console.error('Test runner error:', err);
    process.exitCode = 1;
});
