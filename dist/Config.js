import { readFileSync } from 'fs';
import YAML from 'yaml';
const FIGMA_URL_REGEX = /https:\/\/[\w.-]+\.?figma.com\/([\w-]+)\/([0-9a-zA-Z]{22,128})(?:\/([\w-]+)\/([0-9a-zA-Z]{22,128}))?(?:\/.*)?$/;
class Config {
    figmaIdDesktopStyles;
    figmaIdFirefoxColors;
    figmaIdAndroidComponents;
    figmaIdMobileStyles;
    centralCurrentColorAlias;
    centralSource;
    figmaOnlyVariables;
    figmaAccessToken;
    slackWebhookUrlSuccess;
    slackWebhookUrlFailure;
    onlyRunJobs;
    dryRun;
    android;
    get(name) {
        const value = this[name];
        if (value === undefined || value === null) {
            throw new Error(`Error loading config item: ${name} is not defined`);
        }
        return value;
    }
    constructor() {
        const config = YAML.parse(readFileSync('./config/config.yaml', 'utf8'));
        if (!config.env) {
            config.env = {};
        }
        this.figmaIdDesktopStyles = this.parseFigmaUrl('FIGMA_URL_DESKTOP_STYLES', config.env.FIGMA_URL_DESKTOP_STYLES ||
            process.env.INPUT_FIGMA_URL_DESKTOP_STYLES);
        this.figmaIdFirefoxColors = this.parseFigmaUrl('FIGMA_URL_FIREFOX_COLORS', config.env.FIGMA_URL_FIREFOX_COLORS ||
            process.env.INPUT_FIGMA_URL_FIREFOX_COLORS);
        this.figmaIdAndroidComponents = this.parseFigmaUrl('FIGMA_URL_ANDROID_COMPONENTS', config.env.FIGMA_URL_ANDROID_COMPONENTS ||
            process.env.INPUT_FIGMA_URL_ANDROID_COMPONENTS);
        this.figmaIdMobileStyles = this.parseFigmaUrl('FIGMA_URL_MOBILE_STYLES', config.env.FIGMA_URL_MOBILE_STYLES ||
            process.env.INPUT_FIGMA_URL_MOBILE_STYLES);
        this.centralCurrentColorAlias = config.centralCurrentColorAlias;
        this.centralSource = config.centralSource;
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
        const onlyRunJobsValue = config.env.ONLY_RUN_JOBS || process.env.INPUT_ONLY_RUN_JOBS;
        if (onlyRunJobsValue && onlyRunJobsValue.toLowerCase() !== 'all') {
            const array = onlyRunJobsValue
                .split(',')
                .map((job) => job.trim())
                .filter((job) => job !== '');
            this.onlyRunJobs = array.length > 0 ? array : undefined;
        }
        this.android = config.android;
        this.validateAndroidConfig();
        this.testConfig();
    }
    parseFigmaUrl(name, figmaURL) {
        if (!figmaURL || figmaURL === '') {
            return undefined;
        }
        const match = figmaURL.match(FIGMA_URL_REGEX);
        if (!match) {
            throw new Error(`Error loading config: ${name} is not a valid Figma URL`);
        }
        if (match[1] !== 'design') {
            throw new Error(`Error loading config: ${name} is not a design URL, it is ${match[1]}`);
        }
        if (match[3] && match[4] && match[3] === 'branch') {
            return match[4];
        }
        else {
            return match[2];
        }
    }
    validateAndroidConfig() {
        const androidConfig = this.android;
        if (!androidConfig) {
            throw new Error('Error loading config: android config is undefined');
        }
        const requiredFields = [
            'themeCollectionName',
            'themeCollectionReferenceMode',
            'opacityVariablePrefix',
            'variablePrefix',
            'variablePrefixAlt',
        ];
        for (const field of requiredFields) {
            if (!androidConfig[field] ||
                androidConfig[field] === '') {
                throw new Error(`Error loading config: android.${field} is not defined or empty`);
            }
        }
    }
    testConfig() {
        if (this.centralCurrentColorAlias === undefined) {
            throw new Error('Error loading config: centralCurrentColorAlias is undefined');
        }
        if (this.centralSource === undefined) {
            throw new Error('Error loading config: centralSource is undefined');
        }
        if (this.centralSource.colors === undefined ||
            this.centralSource.primitives === undefined ||
            this.centralSource.theme === undefined) {
            throw new Error('Error loading config: centralSource is not valid');
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
