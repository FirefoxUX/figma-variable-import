import { GetLocalVariablesResponse } from '@figma/rest-api-spec'
import { inferResolvedTypes } from './transform/inferResolvedTypes.js'
import { FigmaCollections } from './types.js'
import { fetchFigmaAPI, FigmaAPIURLs } from '../utils.js'
import { VDCollections } from '../vd.js'
import { normalizeFigmaTokens } from './normalizeFigmaTokens.js'
import { addModesDefinitions } from './transform/modeDefinitions.js'
import { updateVariables } from './transform/updateVariables.js'
import { updateVariableDefinitions } from './transform/variableDefinitions.js'
import UpdateConstructor from './UpdateConstructor.js'

type MakeUpdateOptions = {
  handleDeprecation?: boolean
  dryRun?: boolean
}

export async function submitVDCollections(
  fileId: string,
  figmaTokens: FigmaCollections,
  tokensCollections: VDCollections,
  options?: MakeUpdateOptions,
): Promise<UpdateConstructor> {
  const { handleDeprecation = false, dryRun = false } = options || {}

  const uc = new UpdateConstructor(figmaTokens, fileId)

  // Infer the resolved types of the collections
  const inferredC = inferResolvedTypes(uc, tokensCollections)
  // Iterate over collections and add missing modes
  addModesDefinitions(uc, inferredC)
  //Iterate over collections and add missing variables
  updateVariableDefinitions(uc, inferredC, handleDeprecation)
  // Update the values of the variables
  updateVariables(uc, inferredC)

  await uc.submitChanges(dryRun)

  return uc
}

export async function getFigmaCollections(
  fileId: string,
): Promise<FigmaCollections> {
  const url = FigmaAPIURLs.getLocalVariables(fileId)
  const { meta } = await fetchFigmaAPI<GetLocalVariablesResponse>(url)
  return normalizeFigmaTokens(meta)
}
