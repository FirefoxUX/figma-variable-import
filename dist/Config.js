import { readFileSync } from 'fs';
import YAML from 'yaml';
const FIGMA_URL_REGEX = /https:\/\/[\w.-]+\.?figma.com\/([\w-]+)\/([0-9a-zA-Z]{22,128})(?:\/([\w-]+)\/([0-9a-zA-Z]{22,128}))?(?:\/.*)?$/;
class Config {
    figmaFileId;
    centralCurrentColorAlias;
    centralSource;
    centralOverrides;
    figmaOnlyVariables;
    figmaAccessToken;
    slackWebhookUrlSuccess;
    slackWebhookUrlFailure;
    dryRun;
    constructor() {
        const config = YAML.parse(readFileSync('./config/config.yaml', 'utf8'));
        if (!config.env) {
            config.env = {};
        }
        this.figmaFileId = this.parseFigmaUrl(config.env.FIGMA_URL || process.env.INPUT_FIGMA_URL);
        this.centralCurrentColorAlias = config.centralCurrentColorAlias;
        this.centralSource = config.centralSource;
        this.centralOverrides = config.centralOverrides;
        this.figmaOnlyVariables = config.figmaOnlyVariables;
        this.figmaAccessToken =
            config.env.FIGMA_ACCESS_TOKEN || process.env.INPUT_FIGMA_ACCESS_TOKEN;
        this.slackWebhookUrlSuccess =
            config.env.SLACK_WEBHOOK_SUCCESS ||
                process.env.INPUT_SLACK_WEBHOOK_SUCCESS;
        this.slackWebhookUrlFailure =
            config.env.SLACK_WEBHOOK_FAILURE ||
                process.env.INPUT_SLACK_WEBHOOK_FAILURE;
        this.dryRun =
            config.env.DRY_RUN === 'true' ||
                process.env.INPUT_DRY_RUN === 'true' ||
                false;
        this.testConfig();
    }
    parseFigmaUrl(figmaURL) {
        if (!figmaURL || figmaURL === '') {
            throw new Error('Error loading config: FIGMA_URL is undefined');
        }
        const match = figmaURL.match(FIGMA_URL_REGEX);
        if (!match) {
            throw new Error('Error loading config: FIGMA_URL is not a valid Figma URL');
        }
        if (match[1] !== 'design') {
            throw new Error(`Error loading config: FIGMA_URL is not a design URL, it is ${match[1]}`);
        }
        if (match[3] && match[4] && match[3] === 'branch') {
            return match[4];
        }
        else {
            return match[2];
        }
    }
    potentiallyOverride(tokenName, tokenMode) {
        const searchKey = tokenMode ? `${tokenName}#${tokenMode}` : tokenName;
        return this.centralOverrides[searchKey];
    }
    testConfig() {
        if (this.figmaFileId === undefined || this.figmaFileId === '') {
            throw new Error('Error loading config: figmaFileId is undefined');
        }
        if (this.centralCurrentColorAlias === undefined) {
            throw new Error('Error loading config: centralCurrentColorAlias is undefined');
        }
        if (this.centralSource === undefined) {
            throw new Error('Error loading config: centralSource is undefined');
        }
        if (this.centralOverrides === undefined) {
            throw new Error('Error loading config: centralOverrides is undefined');
        }
        else {
            if (typeof this.centralOverrides !== 'object') {
                throw new Error('Error loading config: centralOverrides is not an object');
            }
            if (!Object.keys(this.centralOverrides).every((k) => typeof k === 'string')) {
                throw new Error('Error loading config: centralOverrides keys are not strings');
            }
            if (!Object.values(this.centralOverrides).every((v) => typeof v === 'string')) {
                throw new Error('Error loading config: centralOverrides values are not strings');
            }
        }
        if (this.figmaOnlyVariables !== undefined) {
            if (!Array.isArray(this.figmaOnlyVariables)) {
                throw new Error('Error loading config: figmaOnlyVariables is not an array');
            }
            if (!this.figmaOnlyVariables.every((v) => typeof v === 'string')) {
                throw new Error('Error loading config: figmaOnlyVariables is not an array of strings');
            }
        }
        if (this.figmaAccessToken === undefined) {
            throw new Error('Error loading config: figmaAccessToken is undefined');
        }
    }
}
const configInstance = new Config();
export default configInstance;
