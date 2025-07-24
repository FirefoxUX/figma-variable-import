# figma-variable-import

This project provides a flexible system for interacting with the [Figma Variables REST API](https://www.figma.com/developers/api#variables), allowing you to query, sync, and update variables from within GitHub Actions.

Despite the name, this repository is capable of a wide range of tasks around managing Figma Variables—not just importing. The system is built around jobs that are executed in GitHub Actions workflows, using a unified format to bridge the gap between external design token systems and Figma’s internal variable model.

---

## Overview

### GitHub Actions / Job System

All operations are designed to run inside GitHub Actions.

- The core job orchestration is defined in `jobs.ts`.
- Jobs are configured to automate workflows such as importing, diffing, and updating Figma variables.

### Figma API Integration

This module provides the ability to:

- Fetch current variable collections from a Figma file
- Translate external design tokens into Figma-compatible formats
- Submit diffs to the Figma Variables API with precision

#### Figma Variable Concepts

- **Variable Types**: RGBA colors, strings, numbers, booleans, or references to other variables.
- **Collections**: Variables are grouped inside collections. A file can contain multiple collections.
- **Modes**: Variables can have multiple modes (e.g., for light/dark themes). All variables in a collection must have a value for each mode.

#### ID-based API

- Figma assigns **uncontrollable IDs** to collections, variables, and modes.
- External design tokens are usually organized by **name**, not ID—so syncing requires mapping names to Figma IDs.

To bridge this gap, the project introduces the **Variable Description Format (VDF)**, a JSON-like structure for defining token data.

#### Variable Description Format (VDF)

```ts
export type VDVariableValue = number | boolean | string | Rgb

export type VDCollections = {
  [collectionName: string]: VDCollection
}

export type VDCollection = {
  [variableName: string]: VDVariable
}

export type VDVariable = {
  [modeName: string]: VDVariableValue
}
```

#### YAML Example

```yaml
Collection1:
  color/black:
    ModeName: '#000000'
  color/white:
    ModeName: '#FFFFFF'
Collection2:
  nested/token:
    Mode1: '#000000'
    Mode2: 'oklch(83% 0.14 15)'
    Mode3: '{Collection1$color/black}'
  nested/token/hover:
    Mode1: '#FFFFFF'
    Mode2: '{Collection1$color/white}'
    Mode3: 'rgba(255, 0, 0, 0.15)'
```

#### Key Functions

- `getFigmaCollections`  
  Fetches collections, variables, and mode metadata from a Figma file.

- `submitVDCollections`  
  Compares current Figma collections with your `VDCollections` and submits updates via the Figma API.  
  *Note: Variables, modes, and collections are never deleted—only added or updated.*

---

### Mozilla-Specific Code

The `mozilla/` directory contains code specific to Mozilla’s design token system. It includes:

- Logic to reorganize Mozilla’s design tokens into the VDF structure
- Helpers to resolve CSS functions (e.g., `color-mix`) into final color values compatible with Figma
