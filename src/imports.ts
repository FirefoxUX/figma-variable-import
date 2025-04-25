/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { CentralCollection } from './types.js'
import { readFileSync } from 'fs'
import YAML from 'yaml'

export const HCM_MAP: CentralCollection = YAML.parse(
  readFileSync('./config/hcm.yaml', 'utf8'),
)
export const OPERATING_SYSTEM_MAP: CentralCollection = YAML.parse(
  readFileSync('./config/operating-system.yaml', 'utf8'),
)
export const SURFACE_MAP: CentralCollection = YAML.parse(
  readFileSync('./config/surface.yaml', 'utf8'),
)
