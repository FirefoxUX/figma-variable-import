/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { readFileSync } from 'fs'
import YAML from 'yaml'
import { CentralTokens } from './mozilla/central-import.js'
import { VDCollection } from './vd.js'

export const HCM_MAP: VDCollection = YAML.parse(
  readFileSync('./config/hcm.yaml', 'utf8'),
)
export const OPERATING_SYSTEM_MAP: VDCollection = YAML.parse(
  readFileSync('./config/operating-system.yaml', 'utf8'),
)
export const SURFACE_MAP: VDCollection = YAML.parse(
  readFileSync('./config/surface.yaml', 'utf8'),
)
export const THEME_MAP: CentralTokens['Theme'] = YAML.parse(
  readFileSync('./config/theme.yaml', 'utf8'),
)
