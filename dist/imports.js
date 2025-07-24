import { readFileSync } from 'fs';
import YAML from 'yaml';
export const HCM_MAP = YAML.parse(readFileSync('./config/hcm.yaml', 'utf8'));
export const OPERATING_SYSTEM_MAP = YAML.parse(readFileSync('./config/operating-system.yaml', 'utf8'));
export const SURFACE_MAP = YAML.parse(readFileSync('./config/surface.yaml', 'utf8'));
export const THEME_MAP = YAML.parse(readFileSync('./config/theme.yaml', 'utf8'));
