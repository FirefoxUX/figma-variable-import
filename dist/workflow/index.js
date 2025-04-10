import { figmaToCulori, isFigmaAlias, roundTo } from '../utils.js';
import { summary } from './summary.js';
import Config from '../Config.js';
import { formatHex } from '../color.js';
export async function documentStats(stats, figCollections) {
    setGithubWorkflowSummary(stats, figCollections);
    await sendSlackWorkflowStats(stats);
}
export async function documentError(error) {
    setGithubWorkflowError(error);
    await sendSlackWorkflowError(error);
}
export async function sendSlackWorkflowStats(stats) {
    if (!Config.slackWebhookUrlSuccess)
        return;
    const numberStats = {
        modesCreated: stats.modesCreated.length,
        variablesCreated: stats.variablesCreated.length,
        variableValuesUpdated: stats.variableValuesUpdated.length,
        variablesDeprecated: stats.variablesDeprecated.length,
        variablesUndeprecated: stats.variablesUndeprecated.length,
    };
    const total = Object.values(numberStats).reduce((acc, curr) => acc + curr, 0);
    if (total === 0)
        return;
    const payload = {
        ...numberStats,
        actionURL: getGithubActionURL(),
    };
    return sendSlackWebhook(Config.slackWebhookUrlSuccess, payload);
}
export function setGithubWorkflowSummary(stats, figCollections) {
    summary.addHeading('Central>Figma Variable Import Summary', 2);
    if (Config.dryRun) {
        summary.addEOL().addRaw('> [!NOTE]').addEOL();
        summary
            .addRaw('> This was a dry run. The changes were not submitted to Figma.')
            .addEOL();
    }
    else if (stats.result === undefined) {
        summary.addEOL().addRaw('> [!WARNING]').addEOL();
        summary
            .addRaw('> Changes were supposed to be submitted to Figma, but no result was recorded, which indicates a possible error.')
            .addEOL();
    }
    else if (typeof stats.result === 'object' && 'error' in stats.result) {
        if (stats.result.error === true) {
            summary.addEOL().addRaw('> [!CAUTION]').addEOL();
            summary
                .addRaw(`> An error occurred while submitting changes to Figma. (Status code: ${stats.result.status})`)
                .addEOL();
            if (stats.result.message) {
                summary.addEOL().addRaw(`>`).addEOL();
                summary.addEOL().addRaw(`> \`\`\``).addEOL();
                stats.result.message.split('\n').forEach((line) => {
                    summary.addEOL().addRaw(`> ${line}`).addEOL();
                });
                summary.addEOL().addRaw(`> \`\`\``).addEOL();
            }
        }
        else {
            summary.addEOL().addRaw('> [!NOTE]').addEOL();
            summary
                .addRaw('> Changes were submitted to Figma without any errors.')
                .addEOL();
        }
    }
    else {
        summary.addEOL().addRaw('> [!CAUTION]').addEOL();
        summary
            .addRaw('> An unexpected error occurred while submitting changes to Figma.')
            .addEOL();
        if (typeof stats.result === 'string') {
            summary.addEOL().addRaw(`>`).addEOL();
            summary.addEOL().addRaw(`> \`\`\``).addEOL();
            stats.result.split('\n').forEach((line) => {
                summary.addEOL().addRaw(`> ${line}`).addEOL();
            });
            summary.addEOL().addRaw(`> \`\`\``).addEOL();
        }
    }
    summary.addEOL();
    summary.addHeading('Modes created', 3);
    if (stats.modesCreated.length === 0) {
        const element = summary.wrap('p', 'No modes were created.');
        summary.addEOL().addRaw(element).addEOL();
    }
    else {
        summary.addTable([
            [
                { data: 'Collection', header: true },
                { data: 'Mode created', header: true },
            ],
            ...stats.modesCreated.map((mode) => [mode.collection, mode.mode]),
        ]);
    }
    summary.addHeading('Variables created', 3);
    if (stats.variablesCreated.length === 0) {
        const element = summary.wrap('p', 'No variables were created.');
        summary.addEOL().addRaw(element).addEOL();
    }
    else {
        summary.addTable([
            [
                { data: 'Collection', header: true },
                { data: 'Variable', header: true },
                { data: 'Type', header: true },
            ],
            ...stats.variablesCreated.map((variable) => [
                variable.collection,
                summary.wrap('strong', variable.variable),
                variable.resolvedType,
            ]),
        ]);
    }
    summary.addHeading('Variable values updated', 3);
    if (stats.variableValuesUpdated.length === 0) {
        const element = summary.wrap('p', 'No variable values were updated.');
        summary.addEOL().addRaw(element).addEOL();
    }
    else {
        summary.addTable([
            [
                { data: 'Collection', header: true },
                { data: 'Variable', header: true },
                { data: 'Mode', header: true },
                { data: 'Old value', header: true },
                { data: 'New value', header: true },
            ],
            ...stats.variableValuesUpdated.map((variable) => [
                variable.collection,
                summary.wrap('strong', variable.variable),
                variable.mode,
                variable.oldValue !== undefined
                    ? summary.wrap('code', formatFigmaVariableValue(variable.oldValue, variable.resolvedType, figCollections))
                    : '',
                summary.wrap('code', formatFigmaVariableValue(variable.newValue, variable.resolvedType, figCollections)),
            ]),
        ]);
    }
    summary.addHeading('Variables deprecated', 3);
    const element1 = summary.wrap('p', 'Variables where a deprecation warning was added to the description.');
    summary.addEOL().addRaw(element1).addEOL();
    if (stats.variablesDeprecated.length === 0) {
        const element = summary.wrap('p', 'No variables were deprecated.');
        summary.addEOL().addRaw(element).addEOL();
    }
    else {
        summary.addTable([
            [
                { data: 'Collection', header: true },
                { data: 'Variable', header: true },
            ],
            ...stats.variablesDeprecated.map((variable) => [
                variable.collection,
                variable.variable,
            ]),
        ]);
    }
    summary.addHeading('Variables undeprecated', 3);
    const element2 = summary.wrap('p', 'Variables where a deprecation warning was removed from the description.');
    summary.addEOL().addRaw(element2).addEOL;
    if (stats.variablesUndeprecated.length === 0) {
        const element = summary.wrap('p', 'No variables were undeprecated.');
        summary.addEOL().addRaw(element).addEOL();
    }
    else {
        summary.addTable([
            [
                { data: 'Collection', header: true },
                { data: 'Variable', header: true },
            ],
            ...stats.variablesUndeprecated.map((variable) => [
                variable.collection,
                variable.variable,
            ]),
        ]);
    }
    summary.write();
}
function setGithubWorkflowError(error) {
    const errorMessage = typeof error === 'string'
        ? error
        : error.stack || error.message || 'An unknown error occurred.';
    summary.addHeading('Central>Figma Variable Import Summary', 2);
    summary.addEOL().addRaw('> [!CAUTION]').addEOL();
    summary
        .addEOL()
        .addRaw('> An error occurred while running the script.')
        .addEOL();
    summary.addEOL().addRaw(`>`).addEOL();
    summary.addEOL().addRaw(`> \`\`\``).addEOL();
    errorMessage.split('\n').forEach((line) => {
        summary.addEOL().addRaw(`> ${line}`).addEOL();
    });
    summary.addEOL().addRaw(`> \`\`\``).addEOL();
    summary.write();
}
async function sendSlackWorkflowError(error) {
    if (!Config.slackWebhookUrlFailure)
        return;
    const payload = {
        errorMessage: typeof error === 'string' ? error : error.message,
        actionURL: getGithubActionURL(),
    };
    return sendSlackWebhook(Config.slackWebhookUrlFailure, payload);
}
function formatFigmaVariableValue(value, resolvedType, figCollections) {
    if (value === undefined) {
        return '(not set)';
    }
    if (isFigmaAlias(value)) {
        for (const collection of Object.values(figCollections)) {
            for (const variable of collection.variables) {
                if (variable.id === value.id) {
                    return `ALIAS(${variable.name})`;
                }
            }
        }
        console.warn(`When creating the summary: Alias with id ${value.id} not found in figma collection`);
        return `ALIAS(${value.id})`;
    }
    if (resolvedType === 'COLOR' && typeof value === 'object' && 'r' in value) {
        const denormalized = figmaToCulori(value);
        if (denormalized === undefined) {
            throw new Error(`When creating the summary: Could not denormalize color value ${JSON.stringify(value)}`);
        }
        return `${formatHex(denormalized).toUpperCase()} ${roundTo((denormalized.alpha === undefined ? 1 : denormalized.alpha) * 100, 2)}%`;
    }
    if (resolvedType === 'FLOAT') {
        return roundTo(value, 4).toString();
    }
    return value.toString();
}
async function sendSlackWebhook(webookUrl, payload) {
    const stringifiedPayload = Object.entries(payload).reduce((acc, [key, value]) => {
        acc[key] = value.toString();
        return acc;
    }, {});
    console.info('Sending Slack webhook:', JSON.stringify(stringifiedPayload));
    try {
        const res = await fetch(webookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(stringifiedPayload),
        });
        if (!res.ok) {
            console.error('Error sending Slack webhook:', res.statusText);
            summary.addSeparator();
            summary.addEOL().addRaw('> [!WARNING]').addEOL();
            summary
                .addRaw('> An error occurred while sending the Slack webhook.')
                .addEOL();
            if (res?.statusText.trim() !== '') {
                summary.addEOL().addRaw(`> \`\`\``).addEOL();
                summary.addEOL().addRaw(`> ${res.statusText}`).addEOL();
                summary.addEOL().addRaw(`> \`\`\``).addEOL();
            }
            summary.write();
        }
        else {
            console.info('Slack webhook sent successfully.');
        }
    }
    catch (error) {
        console.error('Error sending Slack webhook:', error);
        summary.addSeparator();
        summary.addEOL().addRaw('> [!WARNING]').addEOL();
        summary
            .addRaw('> An error occurred while sending the Slack webhook.')
            .addEOL();
        summary
            .addRaw(`> Error Message: \`${error.toString()}\``)
            .addEOL();
        summary.write();
    }
}
function getGithubActionURL() {
    const runId = process.env.GITHUB_RUN_ID;
    const repo = process.env.GITHUB_REPOSITORY;
    if (!runId || !repo) {
        return 'https://github.com';
    }
    return `https://github.com/${repo}/actions/runs/${runId}`;
}
