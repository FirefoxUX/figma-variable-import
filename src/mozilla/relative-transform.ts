import { OPERATING_SYSTEM_MAP, SURFACE_MAP } from './imports.js'
import { VDVariable, VDCollection, extractVdReference } from '../core/vd.js'

// ---------------------------------------------------------------------------
// Relative-unit expansion.
//
// Figma variables only hold concrete values; CSS `rem`/`em`/`calc()` doesn't
// translate directly. This module takes every token classified as "relative"
// by `central-import.ts:filterRelativeUnits` and expands it to per-OS pixel
// values across two surfaces — `chrome` and `in-content`.
//
// Surface root font sizes live in `config/operating-system.yaml` under
// `typography/font-size/<surface>/body/root` — one per-OS value per surface.
//
// Output lands in two places:
//   - per-OS values in the Operating System collection
//     (key: `<original>/<surface>/<rest>`)
//   - per-surface aliases in the Surface collection (modes Chrome / InContent
//     point at the matching Operating System entry)
// ---------------------------------------------------------------------------

// These two keys must match entries in config/operating-system.yaml.
const CHROME_ROOT_KEY = 'typography/font-size/chrome/body/root'
const IN_CONTENT_ROOT_KEY = 'typography/font-size/in-content/body/root'

export function constructRelativeData(
  relativeData: Record<string, { Value: string | number | boolean }>,
) {
  const chromeRootEntry = OPERATING_SYSTEM_MAP[CHROME_ROOT_KEY]
  const inContentRootEntry = OPERATING_SYSTEM_MAP[IN_CONTENT_ROOT_KEY]

  const rootEntries = {
    'in-content': inContentRootEntry,
    chrome: chromeRootEntry,
  }

  if (!chromeRootEntry || !inContentRootEntry) {
    throw new Error(
      `When parsing relative values, the ${CHROME_ROOT_KEY} or ${IN_CONTENT_ROOT_KEY} entry is missing`,
    )
  }
  const normalizedRelativeValues = normalizeRelativeValues(relativeData)

  const updatedOperatingSystemMap = Object.assign({}, OPERATING_SYSTEM_MAP)

  const renamedKeysMap = processRelativeValues(
    normalizedRelativeValues.value,
    rootEntries,
    updatedOperatingSystemMap,
  )
  const surfaceReferenceQueue = processSurfaceReferences(
    renamedKeysMap,
    normalizedRelativeValues.reference,
    rootEntries,
    updatedOperatingSystemMap,
  )
  processCalcs(
    normalizedRelativeValues.calc,
    rootEntries,
    updatedOperatingSystemMap,
    surfaceReferenceQueue,
  )

  const updatedSurfaceMap = addSurfaceTokens(surfaceReferenceQueue)

  return {
    'Operating System': updatedOperatingSystemMap,
    Surface: updatedSurfaceMap,
  }
}

function addSurfaceTokens(
  surfaceReferenceQueue: Record<string, Partial<Record<string, string>>>,
) {
  const updatedSurfaceMap = Object.assign({}, SURFACE_MAP)
  for (const [key, surfaceValues] of Object.entries(surfaceReferenceQueue)) {
    updatedSurfaceMap[key] = Object.entries(surfaceValues).reduce(
      (acc: Record<string, string>, [surfaceKey, surfaceValue]) => {
        switch (surfaceKey) {
          case 'in-content':
            surfaceKey = 'InContent'
            break
          case 'chrome':
            surfaceKey = 'Chrome'
            break
          default:
            throw new Error(
              `When parsing relative values, the surface key ${surfaceKey} is not valid`,
            )
        }

        acc[surfaceKey] = `{Operating System$${surfaceValue}}`
        return acc
      },
      {} as Record<string, string>,
    )
  }
  return updatedSurfaceMap
}

function processSurfaceReferences(
  renamedKeysMap: Record<string, Partial<Record<string, string>>>,
  referenceMap: Record<string, string>,
  rootEntries: { 'in-content': VDVariable; chrome: VDVariable },
  updatedOperatingSystemMap: VDCollection,
) {
  const surfaceReferenceQueue = Object.assign({}, renamedKeysMap)

  // Reference chains can be multi-level (e.g. card/padding → space/large →
  // dimension/relative/100). Look up the reference target in surfaceReferenceQueue,
  // which accumulates entries as earlier reference tokens are processed, rather than
  // in renamedKeysMap (which only contains the em-valued leaves).
  for (const [relativeKey, referenceKey] of Object.entries(referenceMap)) {
    const newReferences = surfaceReferenceQueue[referenceKey]
    if (!newReferences) {
      throw new Error(
        `When parsing relative values, the reference for ${relativeKey} is not found`,
      )
    }
    const [firstSegment, ...remainingSegments] = relativeKey.split('/')
    Object.entries(newReferences).forEach(([surface, newReferenceKey]) => {
      const newRelativeKey = [firstSegment, surface, ...remainingSegments].join(
        '/',
      )
      const newEntry = Object.keys(rootEntries.chrome).reduce(
        (acc: Record<string, string>, key) => {
          acc[key] = `{Operating System$${newReferenceKey}}`
          return acc
        },
        {} as Record<string, string>,
      )
      updatedOperatingSystemMap[newRelativeKey] = newEntry
      if (surfaceReferenceQueue[relativeKey]) {
        if (!surfaceReferenceQueue[relativeKey]) {
          surfaceReferenceQueue[relativeKey] = {}
        }
        surfaceReferenceQueue[relativeKey][surface] = newRelativeKey
      } else {
        surfaceReferenceQueue[relativeKey] = {
          [surface]: newRelativeKey,
        }
      }
    })
  }
  return surfaceReferenceQueue
}

function processRelativeValues(
  relativeValues: Record<string, number>,
  rootEntries: { 'in-content': VDVariable; chrome: VDVariable },
  updatedOperatingSystemMap: VDCollection,
): Record<string, Partial<Record<string, string>>> {
  const renamedKeysMap: Record<string, Partial<Record<string, string>>> = {}
  for (const [relativeKey, relativeValue] of Object.entries(relativeValues)) {
    const [firstSegment, ...remainingSegments] = relativeKey.split('/')
    Object.entries(rootEntries).forEach(([surface, rootEntry]) => {
      const newRelativeKey = [firstSegment, surface, ...remainingSegments].join(
        '/',
      )
      if (renamedKeysMap[relativeKey]) {
        if (!renamedKeysMap[relativeKey]) {
          renamedKeysMap[relativeKey] = {}
        }
        renamedKeysMap[relativeKey][surface] = newRelativeKey
      } else {
        renamedKeysMap[relativeKey] = {
          [surface]: newRelativeKey,
        }
      }

      const newEntry = Object.entries(rootEntry).reduce(
        (acc: Record<string, number>, [key, value]) => {
          if (key === 'id') {
            return acc
          }
          if (typeof value !== 'number') {
            throw new Error(
              `When parsing relative values, the value for ${key} is not a number`,
            )
          }
          acc[key] = Math.round(value * relativeValue)
          return acc
        },
        {} as Record<string, number>,
      )
      updatedOperatingSystemMap[newRelativeKey] = newEntry
    })
  }
  return renamedKeysMap
}

/**
 * Evaluates `calc(...)` tokens per surface × OS mode and emits results into
 * Operating System. Must run *after* `processRelativeValues` and
 * `processSurfaceReferences` — calc references can resolve to em / ref tokens
 * those passes already wrote into `updatedOperatingSystemMap`.
 */
function processCalcs(
  calcs: Record<string, string>,
  rootEntries: { 'in-content': VDVariable; chrome: VDVariable },
  updatedOperatingSystemMap: VDCollection,
  surfaceReferenceQueue: Record<string, Partial<Record<string, string>>>,
) {
  for (const [tokenName, calcStr] of Object.entries(calcs)) {
    const expr = calcStr.replace(/^calc\(/, '').replace(/\)\s*$/, '')

    const [firstSegment, ...remainingSegments] = tokenName.split('/')

    Object.entries(rootEntries).forEach(([surface, rootEntry]) => {
      const newRelativeKey = [firstSegment, surface, ...remainingSegments].join(
        '/',
      )

      const perOsValues: Record<string, number> = {}
      for (const [osMode, rootValue] of Object.entries(rootEntry)) {
        if (osMode === 'id') continue
        if (typeof rootValue !== 'number') {
          throw new Error(
            `When parsing calc values, the root font size for ${osMode} is not a number`,
          )
        }
        perOsValues[osMode] = evaluateCalc(
          expr,
          surface,
          osMode,
          rootValue,
          updatedOperatingSystemMap,
          tokenName,
        )
      }
      updatedOperatingSystemMap[newRelativeKey] = perOsValues

      if (!surfaceReferenceQueue[tokenName]) {
        surfaceReferenceQueue[tokenName] = {}
      }
      surfaceReferenceQueue[tokenName][surface] = newRelativeKey
    })
  }
}

/**
 * Substitute references and unit-bearing literals into a CSS calc expression,
 * then evaluate the arithmetic. Refs resolve against `osMap`, which already
 * holds per-OS values for every other relative token because `processCalcs`
 * runs last.
 */
function evaluateCalc(
  expression: string,
  surface: string,
  osMode: string,
  rootValue: number,
  osMap: VDCollection,
  forTokenName: string,
): number {
  // The collection prefix in the reference is ignored — relative tokens always
  // land in Operating System, so we look up by variable name alone.
  let resolved = expression.replace(
    /\{[^$]+\$([^}]+)\}/g,
    (_, varName: string) => {
      const [first, ...rest] = varName.split('/')
      const surfaceKey = [first, surface, ...rest].join('/')
      const entry = osMap[surfaceKey]
      const resolvedValue = entry?.[osMode]
      if (typeof resolvedValue !== 'number') {
        throw new Error(
          `When evaluating calc for ${forTokenName} [${surface}/${osMode}]: ` +
            `reference {${varName}} → ${surfaceKey}.${osMode} did not resolve to a number.`,
        )
      }
      return String(resolvedValue)
    },
  )

  resolved = resolved.replace(/([\d.]+)r?em\b/g, (_, num: string) => {
    return String(parseFloat(num) * rootValue)
  })
  resolved = resolved.replace(/([\d.]+)px\b/g, '$1')

  if (!/^[\d.+\-*/()\s]+$/.test(resolved)) {
    throw new Error(
      `When evaluating calc for ${forTokenName} [${surface}/${osMode}]: ` +
        `unsupported expression after substitution: "${resolved}"`,
    )
  }
  // Whitelisted arithmetic input only — see the regex check above. Function()
  // is faster and simpler than a hand-rolled parser for + - * / and parens.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  const result: unknown = new Function(`return (${resolved})`)()
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error(
      `When evaluating calc for ${forTokenName} [${surface}/${osMode}]: ` +
        `result is not a finite number (expression: "${resolved}").`,
    )
  }
  return Math.round(result)
}

function normalizeRelativeValues(
  relativeData: Record<string, { Value: string | number | boolean }>,
) {
  return Object.entries(relativeData).reduce(
    (acc, [key, value]) => {
      if (typeof value.Value !== 'string') {
        throw new Error(
          `When parsing relative values, the value for ${key} is not a string`,
        )
      }

      const aliasParts = extractVdReference(value.Value)
      if (aliasParts !== null && /^\{[^$]+\$[^}]+\}$/.test(value.Value)) {
        acc.reference[key] = aliasParts.variable
        return acc
      }

      if (value.Value.startsWith('calc(')) {
        acc.calc[key] = value.Value
        return acc
      }

      const isEmOrRem = value.Value.endsWith('em')
      if (!isEmOrRem) {
        throw new Error(
          `When parsing relative values, the value for ${key} is not a valid relative value or reference`,
        )
      }

      let parsedValue: number
      try {
        parsedValue = parseFloat(value.Value)
      } catch (error) {
        throw new Error(
          `When parsing relative values, the value for ${key} is not a valid number`,
          { cause: error },
        )
      }

      acc.value[key] = parsedValue
      return acc
    },
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    { reference: {}, value: {}, calc: {} } as {
      reference: Record<string, string>
      value: Record<string, number>
      calc: Record<string, string>
    },
  )
}
