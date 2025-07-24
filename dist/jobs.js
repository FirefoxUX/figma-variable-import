import { getAndroidModes } from './mozilla/android.js';
import { getCentralCollectionValues } from './mozilla/central-import.js';
import Config from './Config.js';
import { HCM_MAP } from './imports.js';
import { constructRelativeData } from './mozilla/relative-transform.js';
import { memoize, FigmaAPIURLs } from './utils.js';
import { getFigmaCollections, submitVDCollections } from './figma/index.js';
const memoGetFigmaTokensFromFile = memoize(getFigmaCollections, 'fetchFigmaAPI');
const memoGetCentralCollectionValues = memoize(getCentralCollectionValues);
export default [
    {
        id: 'DESKTOP_STYLES',
        name: 'Central tokens to desktop styles',
        action: async () => {
            const figmaTokens = await memoGetFigmaTokensFromFile(Config.get('figmaIdDesktopStyles'));
            const centralData = await memoGetCentralCollectionValues();
            const relativeData = constructRelativeData(centralData.relative);
            const tokensCollections = {
                'HCM Theme': HCM_MAP,
                ...centralData.central,
                ...relativeData,
            };
            return submitVDCollections(Config.get('figmaIdDesktopStyles'), figmaTokens, tokensCollections, {
                handleDeprecation: true,
                dryRun: Config.dryRun,
            });
        },
    },
    {
        id: 'FX_COLORS',
        name: 'Import color palette to Firefox Colors',
        action: async () => {
            const figmaColorsTokens = await memoGetFigmaTokensFromFile(Config.get('figmaIdFirefoxColors'));
            const centralData = await memoGetCentralCollectionValues();
            const colorsCollections = {
                Colors: centralData.central.Colors,
            };
            return submitVDCollections(Config.get('figmaIdFirefoxColors'), figmaColorsTokens, colorsCollections, {
                handleDeprecation: true,
                dryRun: Config.dryRun,
            });
        },
    },
    {
        id: 'ANDROID_M3_MODES',
        name: 'Update Android M3 modes',
        action: async () => {
            const figmaAndroidTokens = await memoGetFigmaTokensFromFile(Config.get('figmaIdAndroidComponents'));
            const figmaMobileColors = await memoGetFigmaTokensFromFile(FigmaAPIURLs.getLocalVariables(Config.get('figmaIdMobileStyles')));
            const collection = getAndroidModes(figmaAndroidTokens, figmaMobileColors);
            return submitVDCollections(Config.get('figmaIdAndroidComponents'), figmaAndroidTokens, collection, {
                handleDeprecation: false,
                dryRun: Config.dryRun,
            });
        },
    },
];
