import { parse, formatHex8, formatHex, converter, } from 'culori';
const rgb = converter('rgb');
export { formatHex8, formatHex, rgb };
export const customParse = (...args) => {
    if (args.length === 1 && typeof args[0] === 'object') {
        const color = args[0];
        if ('mode' in color) {
            return color;
        }
    }
    const result = parse(...args);
    if (result?.mode === 'oklch') {
        const srgb = oklchToSrgb(result);
        return {
            mode: 'rgb',
            r: srgb.r,
            g: srgb.g,
            b: srgb.b,
            alpha: srgb.alpha,
        };
    }
    return result;
};
function transformVector3D(matrix, vector) {
    const [x, y, z] = vector;
    return [
        x * matrix[0][0] + y * matrix[1][0] + z * matrix[2][0],
        x * matrix[0][1] + y * matrix[1][1] + z * matrix[2][1],
        x * matrix[0][2] + y * matrix[1][2] + z * matrix[2][2],
    ];
}
const OKLAB_TO_LMS = [
    [0.9999999984505198, 1.0000000088817609, 1.000000054672411],
    [0.39633779217376786, -0.10556134232365635, -0.08948418209496577],
    [0.2158037580607588, -0.0638541747717059, -1.2914855378640917],
];
const LMS_TO_XYZ = [
    [1.2268798733741557, -0.04057576262431372, -0.07637294974672142],
    [-0.5578149965554813, 1.1122868293970594, -0.4214933239627914],
    [0.28139105017721583, -0.07171106666151701, 1.5869240244272418],
];
const FROM_XYZ = [
    [3.2409699419045213, -0.9692436362808798, 0.05563007969699361],
    [-1.5373831775700935, 1.8759675015077206, -0.20397695888897657],
    [-0.4986107602930033, 0.04155505740717561, 1.0569715142428786],
];
function oklchToOklab({ l, c, h, alpha }) {
    const hueRad = (h ?? 0) * (Math.PI / 180);
    return {
        mode: 'oklab',
        l,
        a: c * Math.cos(hueRad),
        b: c * Math.sin(hueRad),
        alpha,
    };
}
function oklabToXyz({ l, a, b, alpha }) {
    const lms = transformVector3D(OKLAB_TO_LMS, [l, a, b]).map((v) => v * v * v);
    const [x, y, z] = transformVector3D(LMS_TO_XYZ, lms);
    return { mode: 'xyz', x, y, z, alpha };
}
function xyzToLinearSrgb({ x, y, z, alpha }) {
    const [r, g, b] = transformVector3D(FROM_XYZ, [x, y, z]);
    return { mode: 'srgb', r, g, b, alpha };
}
function linearSrgbToSrgb({ r, g, b, alpha }) {
    function encode(channel) {
        const abs = Math.abs(channel);
        return abs > 0.0031308
            ? Math.sign(channel) * (1.055 * Math.pow(abs, 1 / 2.4) - 0.055)
            : 12.92 * channel;
    }
    function clamp01(value) {
        return Math.min(1, Math.max(0, value));
    }
    return {
        mode: 'srgb',
        r: clamp01(encode(r)),
        g: clamp01(encode(g)),
        b: clamp01(encode(b)),
        alpha,
    };
}
function oklchToSrgb(input) {
    const oklab = oklchToOklab(input);
    const xyz = oklabToXyz(oklab);
    const linear = xyzToLinearSrgb(xyz);
    return linearSrgbToSrgb(linear);
}
