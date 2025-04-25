import { OPERATING_SYSTEM_MAP, SURFACE_MAP } from './imports.js'
import { CentralVariable, CentralCollection } from './types.js'
import { extractAliasParts } from './utils.js'

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
  rootEntries: { 'in-content': CentralVariable; chrome: CentralVariable },
  updatedOperatingSystemMap: CentralCollection,
) {
  const surfaceReferenceQueue = Object.assign({}, renamedKeysMap)

  for (const [relativeKey, referenceKey] of Object.entries(referenceMap)) {
    const newReferences = renamedKeysMap[referenceKey]
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
  rootEntries: { 'in-content': CentralVariable; chrome: CentralVariable },
  updatedOperatingSystemMap: CentralCollection,
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

      const aliasParts = extractAliasParts(value.Value)
      if (aliasParts !== null) {
        acc.reference[key] = aliasParts.variable
        return acc
      }

      const isEmOrRem = value.Value.endsWith('em')
      if (!isEmOrRem) {
        throw new Error(
          `When parsing relative values, the value for ${key} is not a valid relative value or reference`,
        )
      }

      let parsedValue = 0
      try {
        parsedValue = parseFloat(value.Value)
      } catch (_error) {
        throw new Error(
          `When parsing relative values, the value for ${key} is not a valid number`,
        )
      }

      acc.value[key] = parsedValue
      return acc
    },
    { reference: {}, value: {} } as {
      reference: Record<string, string>
      value: Record<string, number>
    },
  )
}
