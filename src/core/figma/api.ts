import { FigmaResponseWrapper } from './types.js'

const FIGMA_API_ENDPOINT = 'https://api.figma.com'

export const FigmaAPIURLs = {
  getLocalVariables: (fileId: string) =>
    `${FIGMA_API_ENDPOINT}/v1/files/${fileId}/variables/local`,
  getPublishedVariables: (fileId: string) =>
    `${FIGMA_API_ENDPOINT}/v1/files/${fileId}/variables/published`,
  postVariables: (fileId: string) =>
    `${FIGMA_API_ENDPOINT}/v1/files/${fileId}/variables`,
}

export async function fetchFigmaAPI<T>(
  url: string,
  figmaAccessToken: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = {
    'X-FIGMA-TOKEN': figmaAccessToken,
    ...options.headers,
  }

  const finalOptions: RequestInit = {
    ...options,
    headers,
  }

  try {
    const response = await fetch(url, finalOptions)
    const data = (await response.json()) as FigmaResponseWrapper<T>
    if (data.error === true) {
      throw new Error(
        `When fetching Figma API, an error occurred: ${data.message}`,
      )
    }

    return data as T
  } catch (error) {
    console.error('Error fetching Figma API:', error)
    throw error
  }
}
