import { SYMBOL_RESOLVED_TYPE } from './utils.js';
const REFERENCE_REGEX = /{([^$]+)\$([^}]+)}/;
export function isVdReference(value) {
    if (typeof value !== 'string')
        return false;
    return REFERENCE_REGEX.test(value);
}
export function extractVdReference(value) {
    if (typeof value !== 'string')
        return null;
    const match = REFERENCE_REGEX.exec(value);
    if (match) {
        return {
            collection: match[1],
            variable: match[2],
        };
    }
    return null;
}
