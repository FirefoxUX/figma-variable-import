import {
  parse,
  formatHex8,
  formatHex,
  type Color,
  type Rgb,
  converter,
} from 'culori'

// Currently there is no standardized way to convert from oklch to srgb across
// browsers. To come up with the same result as Firefox, we are using the same
// implementation (ported over from Rust).
// https://searchfox.org/mozilla-central/rev/601256c3cc6f397b018995810fd3f586570f50ee/servo/components/style/color/mod.rs#573,591

const rgb = converter('rgb')

export { formatHex8, formatHex, type Color, type Rgb, rgb }
export const customParse: typeof parse = (...args) => {
  // check if already a culori color
  if (args.length === 1 && typeof args[0] === 'object') {
    const color = args[0] as Color
    if ('mode' in color) {
      return color
    }
  }

  const result = parse(...args)
  if (result?.mode === 'oklch') {
    const srgb = oklchToSrgb(result as OklchColor)
    return {
      mode: 'rgb',
      r: srgb.r,
      g: srgb.g,
      b: srgb.b,
      alpha: srgb.alpha,
    }
  }
  return result
}

type OklchColor = {
  mode: 'oklch'
  l: number
  c: number
  h: number
  alpha?: number
}
type OklabColor = {
  mode: 'oklab'
  l: number
  a: number
  b: number
  alpha?: number
}
type XyzColor = { mode: 'xyz'; x: number; y: number; z: number; alpha?: number }
type SrgbColor = {
  mode: 'srgb'
  r: number
  g: number
  b: number
  alpha?: number
}

type TransformMatrix = number[][]

function transformVector3D(
  matrix: TransformMatrix,
  vector: [number, number, number],
): [number, number, number] {
  const [x, y, z] = vector
  return [
    x * matrix[0][0] + y * matrix[1][0] + z * matrix[2][0],
    x * matrix[0][1] + y * matrix[1][1] + z * matrix[2][1],
    x * matrix[0][2] + y * matrix[1][2] + z * matrix[2][2],
  ]
}

const OKLAB_TO_LMS = [
  [0.9999999984505198, 1.0000000088817609, 1.000000054672411],
  [0.39633779217376786, -0.10556134232365635, -0.08948418209496577],
  [0.2158037580607588, -0.0638541747717059, -1.2914855378640917],
]
const LMS_TO_XYZ = [
  [1.2268798733741557, -0.04057576262431372, -0.07637294974672142],
  [-0.5578149965554813, 1.1122868293970594, -0.4214933239627914],
  [0.28139105017721583, -0.07171106666151701, 1.5869240244272418],
]
const FROM_XYZ = [
  [3.2409699419045213, -0.9692436362808798, 0.05563007969699361],
  [-1.5373831775700935, 1.8759675015077206, -0.20397695888897657],
  [-0.4986107602930033, 0.04155505740717561, 1.0569715142428786],
]

// Convert OKLCH to Oklab
function oklchToOklab({ l, c, h, alpha }: OklchColor): OklabColor {
  const hueRad = (h ?? 0) * (Math.PI / 180) // convert hue to radians
  return {
    mode: 'oklab',
    l,
    a: c * Math.cos(hueRad),
    b: c * Math.sin(hueRad),
    alpha,
  }
}

function oklabToXyz({ l, a, b, alpha }: OklabColor): XyzColor {
  const lms = transformVector3D(OKLAB_TO_LMS, [l, a, b]).map((v) => v * v * v)
  const [x, y, z] = transformVector3D(
    LMS_TO_XYZ,
    lms as [number, number, number],
  )
  return { mode: 'xyz', x, y, z, alpha }
}

// Convert XYZ to linear-light sRGB
function xyzToLinearSrgb({ x, y, z, alpha }: XyzColor): SrgbColor {
  const [r, g, b] = transformVector3D(FROM_XYZ, [x, y, z])
  return { mode: 'srgb', r, g, b, alpha }
}

// Apply gamma correction to linear-light sRGB
function linearSrgbToSrgb({ r, g, b, alpha }: SrgbColor): SrgbColor {
  function encode(channel: number): number {
    const abs = Math.abs(channel)
    return abs > 0.0031308
      ? Math.sign(channel) * (1.055 * Math.pow(abs, 1 / 2.4) - 0.055)
      : 12.92 * channel
  }
  function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value))
  }

  // Apply encoding then clamp to [0, 1] range
  return {
    mode: 'srgb',
    r: clamp01(encode(r)),
    g: clamp01(encode(g)),
    b: clamp01(encode(b)),
    alpha,
  }
}

// Full pipeline: OKLCH → Oklab → XYZ → linear sRGB → gamma-corrected sRGB
function oklchToSrgb(input: OklchColor): SrgbColor {
  const oklab = oklchToOklab(input)
  const xyz = oklabToXyz(oklab)
  const linear = xyzToLinearSrgb(xyz)
  return linearSrgbToSrgb(linear)
}
