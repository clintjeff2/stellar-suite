import * as vscode from 'vscode';
import { SorobanCliService } from '../services/sorobanCliService';
import { RpcService } from '../services/rpcService';
import { ContractInspector, ContractFunction } from '../services/contractInspector';
import { WorkspaceDetector } from '../utils/workspaceDetector';
import { SimulationPanel } from '../ui/simulationPanel';
import { SidebarViewProvider } from '../ui/sidebarView';
import { formatError } from '../utils/errorFormatter';
import { resolveCliConfigurationForCommand } from '../services/cliConfigurationVscode';
import { SimulationCacheService } from '../services/simulationCacheService';
import { SimulationValidationService } from '../services/simulationValidationService';
import { ContractWorkspaceStateService } from '../services/contractWorkStateService';
import { InputSanitizationService } from '../services/inputSanitizationService';
import { parseParameters } from '../utils/abiParser';
import { AbiFormGeneratorService } from '../services/abiFormGeneratorService';
import { FormValidationService } from '../services/formValidationService';
import { ContractFormPanel } from '../ui/contractFormPanel';

export async function simulateTransaction(context: vscode.ExtensionContext, sidebarProvider?: SidebarViewProvider) {
    const sanitizer = new InputSanitizationService();
    try {
        const resolvedCliConfig = await resolveCliConfigurationForCommand(context);
        if (!resolvedCliConfig.validation.valid) {
            vscode.window.showErrorMessage(
                `CLI configuration is invalid: ${resolvedCliConfig.validation.errors.join(' ')}`
            );
            return;
        }

        const useLocalCli = resolvedCliConfig.configuration.useLocalCli;
        const cliPath = resolvedCliConfig.configuration.cliPath;
        const source = resolvedCliConfig.configuration.source;
        const network = resolvedCliConfig.configuration.network;
        const rpcUrl = resolvedCliConfig.configuration.rpcUrl;

        const lastContractId = context.workspaceState.get<string>('lastContractId');
        
        const workspaceStateService = new ContractWorkspaceStateService(context, { appendLine: () => {} });
        await workspaceStateService.initialize();
        const lastContractId = context.workspaceState.get<string>('stellarSuite.lastContractId') ?? '';

        let defaultContractId = lastContractId || '';
        try {
            if (!defaultContractId) {
                const detectedId = await WorkspaceDetector.findContractId();
                if (detectedId) {
                    defaultContractId = detectedId;
                }
            }
        } catch {
            // ignore
        }

        const rawContractId = await vscode.window.showInputBox({
            prompt: 'Enter the contract ID (address)',
            placeHolder: defaultContractId || 'e.g., C...',
            value: defaultContractId,
            validateInput: (value: string) => {
                const result = sanitizer.sanitizeContractId(value, { field: 'contractId' });
                if (!result.valid) {
                    return result.errors[0];
                }
                return null;
            }
        });

        if (rawContractId === undefined) {
            return; // User cancelled
        }

        // Inspect contract to get available functions
        let contractFunctions: ContractFunction[] = [];
        let selectedFunction: ContractFunction | null = null;
        let functionName = '';

        if (useLocalCli) {
            // Try to get contract functions
            const inspector = new ContractInspector(cliPath, source);
            try {
                contractFunctions = await inspector.getContractFunctions(contractId);
            } catch {
                // If inspection fails, continue with manual input
                console.log('Contract inspection failed, using manual input');
            }
        const contractIdResult = sanitizer.sanitizeContractId(rawContractId, { field: 'contractId' });
        if (!contractIdResult.valid) {
            vscode.window.showErrorMessage(`Invalid contract ID: ${contractIdResult.errors[0]}`);
            return;
        }
        const contractId = contractIdResult.sanitizedValue;

        // If we have functions, show a picker
        if (contractFunctions.length > 0) {
            const functionItems = contractFunctions.map(fn => ({
                label: fn.name,
                description: fn.description || '',
                detail: fn.parameters.length > 0
                    ? `Parameters: ${fn.parameters.map(p => p.name).join(', ')}`
                    : 'No parameters'
            }));

            const selected = await vscode.window.showQuickPick(functionItems, {
                placeHolder: 'Select a function to invoke'
            });

            if (!selected) {
                return; // User cancelled
            }
        await context.workspaceState.update('stellarSuite.lastContractId', contractId);

        // Get the function name to call
        const rawFunctionName = await vscode.window.showInputBox({
            prompt: 'Enter the function name to simulate',
            placeHolder: 'e.g., transfer',
            validateInput: (value: string) => {
                const result = sanitizer.sanitizeFunctionName(value, { field: 'functionName' });
                if (!result.valid) {
                    return result.errors[0];
                }
                return null;
            }
        });

        if (rawFunctionName === undefined) {
            return; // User cancelled
        }

        const functionNameResult = sanitizer.sanitizeFunctionName(rawFunctionName, { field: 'functionName' });
        if (!functionNameResult.valid) {
            vscode.window.showErrorMessage(`Invalid function name: ${functionNameResult.errors[0]}`);
            return;
        }
        const functionName = functionNameResult.sanitizedValue;

        // Collect function arguments based on parameters
        let args: any[] = [];

        if (selectedFunction && selectedFunction.parameters.length > 0) {
            // Build arguments object from parameters
            const argsObj: any = {};

            for (const param of selectedFunction.parameters) {
                const paramValue = await vscode.window.showInputBox({
                    prompt: `Enter value for parameter: ${param.name}${param.type ? ` (${param.type})` : ''}${param.required ? '' : ' (optional)'}`,
                    placeHolder: param.description || `Value for ${param.name}`,
                    ignoreFocusOut: !param.required,
                    validateInput: (value: string) => {
                        if (param.required && (!value || value.trim().length === 0)) {
                            return `${param.name} is required`;
                        }
                        return null;
                    }
                });
        // Get function info to build typed form fields
        const inspector = new ContractInspector(useLocalCli ? cliPath : rpcUrl, source);
        const contractFunctions = await inspector.getContractFunctions(contractId);
        const selectedFunction = contractFunctions.find(f => f.name === functionName);

        // Parse ABI parameters and open dynamic form
        const abiParams = parseParameters(selectedFunction?.parameters ?? []);
        const generatedForm = new AbiFormGeneratorService().generateForm(
            contractId,
            { name: functionName, parameters: selectedFunction?.parameters ?? [] },
            abiParams
        );
        const formPanel = ContractFormPanel.createOrShow(context, generatedForm);
        const formValidator = new FormValidationService();

        let sanitizedArgs: Record<string, unknown> | null = null;

        // Validation loop — panel stays open until valid data is submitted or user cancels
        while (sanitizedArgs === null) {
            const formData = await formPanel.waitForSubmit();

            if (formData === null) {
                return; // User cancelled or closed the panel
            }

            // Convert to array format expected by services
            args = [argsObj];
        } else {
            // No parameters or couldn't get function info - use manual input
            const argsInput = await vscode.window.showInputBox({
                prompt: 'Enter function arguments as JSON object (e.g., {"name": "value"})',
                placeHolder: 'e.g., {"name": "world"}',
                value: '{}'
            });

            if (argsInput === undefined) {
                return; // User cancelled
            const vr = formValidator.validate(formData, abiParams, sanitizer);

            if (!vr.valid) {
                formPanel.showErrors(vr.errors);
                continue; // Wait for the next submission attempt
            }

            if (Object.keys(vr.warnings).length > 0) {
                formPanel.showWarnings(vr.warnings);
            }

            sanitizedArgs = vr.sanitizedArgs;
        }

        const args: any[] = [sanitizedArgs];

        // Validate simulation input and predict possible failures before execution
        const validationService = new SimulationValidationService();
        const validationReport = validationService.validateSimulation(
            contractId,
            functionName,
            args,
            selectedFunction ?? null,
            contractFunctions
        );

        const validationWarnings = [
            ...validationReport.warnings,
            ...validationReport.predictedErrors
                .filter(prediction => prediction.severity === 'warning')
                .map(prediction => `${prediction.code}: ${prediction.message}`),
        ];

        if (!validationReport.valid) {
            const validationErrorMessage = [
                ...validationReport.errors,
                ...(validationReport.suggestions.length > 0
                    ? ['Suggestions:', ...validationReport.suggestions.map(suggestion => `- ${suggestion}`)]
                    : []),
            ].join('\n');

            const panel = SimulationPanel.createOrShow(context);
            panel.updateResults(
                {
                    success: false,
                    error: `Simulation validation failed before execution.\n\n${validationErrorMessage}`,
                    errorSummary: validationReport.errors[0],
                    errorSuggestions: validationReport.suggestions,
                    validationWarnings,
                },
                contractId,
                functionName,
                args
            );

            vscode.window.showErrorMessage(`Simulation validation failed: ${validationReport.errors[0]}`);
            return;
        }

        if (validationWarnings.length > 0) {
            const firstWarning = validationWarnings[0];
            const selection = await vscode.window.showWarningMessage(
                `Simulation pre-check warning: ${firstWarning}`,
                'Continue',
                'Cancel'
            );

            if (selection !== 'Continue') {
                vscode.window.showInformationMessage('Simulation cancelled due to validation warning.');
                return;
            }
        }

        // Create and show the simulation panel
        const panel = SimulationPanel.createOrShow(context);
        panel.updateResults(
            { success: false, error: 'Running simulation...' } as any,
            { success: false, error: 'Running simulation...', validationWarnings },
            contractId,
            functionName,
            args
        );

        // Cache service (shared)
        const cache = SimulationCacheService.getInstance(context);
        const cacheParamsBase = { contractId, functionName, args };

        // Show progress indicator
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Simulating Soroban Transaction',
                cancellable: false
            },
            async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
                progress.report({ increment: 0, message: 'Initializing...' });

                let result: any;

                if (useLocalCli) {
                    // Cache lookup (CLI)
                    const cached = cache.tryGet({
                        backend: 'cli',
                        ...cacheParamsBase,
                        network,
                        source
                    });

                    if (cached) {
                        result = cached;
                        progress.report({ increment: 100, message: 'Complete (cache hit)' });

                        panel.updateResults(result, contractId, functionName, args);
                        if (sidebarProvider) {
                            sidebarProvider.showSimulationResult(contractId, result);
                        }

                        vscode.window.showInformationMessage('Simulation loaded from cache');
                        return;
                    }

                    // Use local CLI
                    progress.report({ increment: 30, message: 'Using Stellar CLI...' });

                    // Try to find CLI if configured path doesn't work
                    let actualCliPath = cliPath;
                    let cliService = new SorobanCliService(actualCliPath, source);

                    // Check if CLI is available at configured path
                    let cliAvailable = await cliService.isAvailable();

                    // If not available and using default, try to auto-detect
                    if (!cliAvailable && cliPath === 'stellar') {
                        progress.report({ increment: 35, message: 'Auto-detecting Stellar CLI...' });
                        const foundPath = await SorobanCliService.findCliPath();
                        if (foundPath) {
                            actualCliPath = foundPath;
                            cliService = new SorobanCliService(actualCliPath, source);
                            cliAvailable = await cliService.isAvailable();
                        }
                    }

                    if (!cliAvailable) {
                        const foundPath = await SorobanCliService.findCliPath();
                        const suggestion = foundPath
let actualCliPath = cliPath;
let cliService = new SorobanCliService(actualCliPath, source);

if (!await cliService.isAvailable()) {
    const foundPath = await SorobanCliService.findCliPath();
                        const suggestion = foundPath 
                            ? `\n\nFound Stellar CLI at: ${foundPath}\nUpdate your stellarSuite.cliPath setting to: "${foundPath}"`
                            : '\n\nCommon locations:\n- ~/.cargo/bin/stellar\n- /usr/local/bin/stellar\n\nOr install Stellar CLI: https://developers.stellar.org/docs/tools/cli';

                        result = {
                            success: false,
                            error: `Stellar CLI not found at "${cliPath}".${suggestion}`
                        };
                    } else {
                        progress.report({ increment: 50, message: 'Executing simulation...' });
                        result = await cliService.simulateTransaction(contractId, functionName, args, network);
                    }

                    // Cache store (CLI) — cache both success & failure to avoid repeated identical sims.
                    // If you only want to cache successes, wrap this with: if (result?.success) { ... }
                    cache.set(
                        { backend: 'cli', ...cacheParamsBase, network, source },
                        result
                    );
                } else {
                    // Cache lookup (RPC)
                    const cached = cache.tryGet({
                        backend: 'rpc',
                        ...cacheParamsBase,
                        rpcUrl
                    });

                    if (cached) {
                        result = cached;
                        progress.report({ increment: 100, message: 'Complete (cache hit)' });

                        panel.updateResults(result, contractId, functionName, args);
                        if (sidebarProvider) {
                            sidebarProvider.showSimulationResult(contractId, result);
                        }

                        vscode.window.showInformationMessage('Simulation loaded from cache');
                        return;
                    }

                    // Use RPC
                    progress.report({ increment: 30, message: 'Connecting to RPC...' });
                    const rpcService = new RpcService(rpcUrl);

                    progress.report({ increment: 50, message: 'Executing simulation...' });
                    result = await rpcService.simulateTransaction(contractId, functionName, args);

                    // Cache store (RPC)
                    cache.set(
                        { backend: 'rpc', ...cacheParamsBase, rpcUrl },
                        result
                    );
                }

                progress.report({ increment: 100, message: 'Complete' });

                // Update panel with results
                panel.updateResults({ ...result, validationWarnings }, contractId, functionName, args);

                // Update sidebar view
                if (sidebarProvider) {
                    sidebarProvider.showSimulationResult(contractId, result);
                }

                // Show notification
                if (result.success) {
                    vscode.window.showInformationMessage('Simulation completed successfully');
                } else {
                    const notificationMessage = result.errorSummary
                        ? `Simulation failed: ${result.errorSummary}`
                        : `Simulation failed: ${result.error}`;
                    vscode.window.showErrorMessage(notificationMessage);
                }
            }
        );
    } catch (error) {
        const formatted = formatError(error, 'Simulation');
        vscode.window.showErrorMessage(`${formatted.title}: ${formatted.message}`);
    }
}