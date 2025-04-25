import { figmaToCulori, getMemoStats, isFigmaAlias, roundTo } from '../utils.js';
import { summary } from './summary.js';
import Config from '../Config.js';
import { formatHex } from '../color.js';
class WorkflowLogger {
    data = [];
    constructor() {
        this.setupHeader();
    }
    writeInfoBoxMessage(info) {
        summary.addEOL().addRaw(`> [!${info.type.toUpperCase()}]`).addEOL();
        summary.addRaw(`> ${info.message}`).addEOL();
        if (info.code) {
            summary.addEOL().addRaw(`>`).addEOL();
            summary.addEOL().addRaw(`> \`\`\``).addEOL();
            info.code.split('\n').forEach((line) => {
                summary.addRaw(`> ${line}`).addEOL();
            });
            summary.addEOL().addRaw(`> \`\`\``).addEOL();
        }
        summary.addEOL();
    }
    setupHeader() {
        summary.addHeading('Figma Variable Script Summary', 2);
        if (Config.dryRun) {
            this.writeInfoBoxMessage({
                type: 'note',
                message: 'This was a dry run. No changes were made to Figma.\nBelow is a summary of the changes that would be made.',
            });
        }
    }
    documentJob(data) {
        this.data.push(data);
    }
    async finalize() {
        summary.addEOL().addHeading('Jobs', 3);
        summary.addList(this.data.map(({ jobId, jobName }) => summary.wrap('a', summary.wrap('strong', jobName), {
            href: `#user-content-job-${jobId}`,
        })), true);
        summary.addEOL().addSeparator().addEOL();
        for (const entry of this.data) {
            const infoMessage = this.getJobInfo(entry);
            await this.createJobSummary(entry, infoMessage);
            await this.createJobSlackMessage(entry, infoMessage);
        }
        this.logMemoizationStats();
        await summary.write();
    }
    logMemoizationStats() {
        const memoStats = getMemoStats();
        if (memoStats.length > 0) {
            summary.addEOL().addHeading('Memoization stats', 3);
            summary.addTable([
                [
                    { data: 'Function', header: true },
                    { data: 'Hits', header: true },
                    { data: 'Misses', header: true },
                    { data: 'Hit rate', header: true },
                ],
                ...memoStats.map((stat) => [
                    stat.name.toString(),
                    stat.hits.toString(),
                    stat.misses.toString(),
                    `${stat.hits + stat.misses === 0
                        ? 'N/A'
                        : `${Math.round((stat.hits / (stat.hits + stat.misses)) * 100)}%`}`,
                ]),
            ]);
            summary.addEOL();
        }
    }
    async createJobSummary(data, infoMessage) {
        const { jobId, jobName } = data;
        summary
            .addRaw(summary.wrap('h3', jobName, { id: `job-${jobId}` }))
            .addEOL()
            .addEOL();
        if (infoMessage) {
            this.writeInfoBoxMessage(infoMessage);
            summary.addEOL();
        }
        if ('stats' in data) {
            const { stats, figCollections } = data;
            if (stats.modesCreated.length > 0) {
                summary.addHeading('Modes created', 2);
                summary.addTable([
                    [
                        { data: 'Collection', header: true },
                        { data: 'Mode created', header: true },
                    ],
                    ...stats.modesCreated.map((mode) => [mode.collection, mode.mode]),
                ]);
            }
            if (stats.variablesCreated.length > 0) {
                summary.addHeading('Variables created', 2);
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
            if (stats.variableValuesUpdated.length > 0) {
                summary.addHeading('Variable values updated', 2);
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
            if (stats.variablesDeprecated.length > 0) {
                summary.addHeading('Variables deprecated', 2);
                const element1 = summary.wrap('p', 'Variables where a deprecation warning was added to the description.');
                summary.addEOL().addRaw(element1).addEOL();
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
            if (stats.variablesUndeprecated.length > 0) {
                summary.addHeading('Variables undeprecated', 2);
                const element2 = summary.wrap('p', 'Variables where a deprecation warning was removed from the description.');
                summary.addEOL().addRaw(element2).addEOL();
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
        }
        await summary.write();
    }
    getJobInfo(data) {
        let infoMessage;
        if ('error' in data) {
            const error = data.error;
            const errorMessage = typeof error === 'string'
                ? error
                : error.stack || error.message || 'An unknown error occurred.';
            infoMessage = {
                type: 'caution',
                message: 'An error occurred while running the script.',
                code: errorMessage,
            };
        }
        else if ('stats' in data && data.stats.emptyChangeset === true) {
            infoMessage = {
                type: 'note',
                message: 'No changes were found for this job.',
            };
        }
        else if (!Config.dryRun && 'stats' in data) {
            const { stats } = data;
            if (stats.result === undefined) {
                infoMessage = {
                    type: 'warning',
                    message: 'Changes were supposed to be submitted to Figma, but no result was recorded, which indicates a possible error.',
                };
            }
            else if (typeof stats.result === 'object' && 'error' in stats.result) {
                if (stats.result.error === true) {
                    infoMessage = {
                        type: 'caution',
                        message: `An error occurred while submitting changes to Figma. (Status code: ${stats.result.status})`,
                        code: stats.result.message,
                    };
                }
                else {
                    infoMessage = {
                        type: 'note',
                        message: 'Changes were submitted to Figma without any errors. Yay!',
                    };
                }
            }
            else {
                infoMessage = {
                    type: 'caution',
                    message: 'An unexpected error occurred while submitting changes to Figma.',
                    code: typeof stats.result === 'string' ? stats.result : undefined,
                };
            }
        }
        return infoMessage;
    }
    async createJobSlackMessage(data, infoMessage) {
        const webookUrl = 'stats' in data
            ? Config.slackWebhookUrlSuccess
            : Config.slackWebhookUrlFailure;
        if (!webookUrl) {
            return;
        }
        let message = '';
        if (infoMessage) {
            message += `[!${infoMessage.type.toUpperCase()}] ${infoMessage.message}\n`;
            if (infoMessage.code) {
                message += infoMessage.code
                    .split('\n')
                    .map((line) => `> ${line}`)
                    .join('\n');
            }
            message += '\n';
        }
        if ('stats' in data) {
            const { stats } = data;
            message += 'Statistics:\n';
            message += Object.entries({
                '  - Modes created': stats.modesCreated.length,
                '  - Variables created': stats.variablesCreated.length,
                '  - Variable values updated': stats.variableValuesUpdated.length,
                '  - Variables deprecated': stats.variablesDeprecated.length,
                '  - Variables undeprecated': stats.variablesUndeprecated.length,
            })
                .filter(([_, count]) => count > 0)
                .map(([label, count]) => `${label}: ${count}`)
                .join('\n');
        }
        message = message.trim();
        if (!message) {
            return;
        }
        await this.sendSlackWebhook(webookUrl, {
            heading: data.jobName,
            message,
            actionURL: getGithubActionURL(),
        });
    }
    async sendSlackWebhook(webookUrl, payload) {
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
                this.writeInfoBoxMessage({
                    type: 'warning',
                    message: 'An error occurred while sending the Slack webhook.',
                    code: res?.statusText.trim() !== '' ? res.statusText : undefined,
                });
                await summary.write();
            }
            else {
                console.info('Slack webhook sent successfully.');
            }
        }
        catch (error) {
            console.error('Error sending Slack webhook:', error);
            summary.addSeparator();
            this.writeInfoBoxMessage({
                type: 'warning',
                message: 'An error occurred while sending the Slack webhook.',
                code: error.toString(),
            });
            await summary.write();
        }
    }
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
    return typeof value === 'object' ? JSON.stringify(value) : value.toString();
}
function getGithubActionURL() {
    const runId = process.env.GITHUB_RUN_ID;
    const repo = process.env.GITHUB_REPOSITORY;
    if (!runId || !repo) {
        return 'https://github.com';
    }
    return `https://github.com/${repo}/actions/runs/${runId}`;
}
export default new WorkflowLogger();
