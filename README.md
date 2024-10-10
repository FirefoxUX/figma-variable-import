# figma-variable-import

This repository contains a script to fetch design tokens from Mozilla Central and import them into the Firefox Figma library. The script helps keep the Figma design files synchronized with the latest design tokens used across Firefox, ensuring consistency in design systems.

## Workflow Overview

### Automated Sync via GitHub Actions

Every Tuesday at 4 PM UTC, a GitHub Action automatically checks for changes in the design tokens from Mozilla Central. If changes are detected, the following steps occur:
1. A Slack Workflow is triggered via webhook, sending a message team that there are outstanding changes.
2. The team must manually apply these changes by following the steps outlined below.

### Applying Changes to the Figma File

1. **Create a New Branch:**
   - Before applying the token updates, create a new branch from the file containing the relevant Figma styles.
   
2. **Trigger the Workflow:**
   - Once the new branch is ready, manually trigger the corresponding GitHub workflow by providing the URL of the workflow as an argument. This workflow will apply the token changes to the branch.
3. **Review Changes:**
   - After the workflow completes, review the changes in the Figma file to ensure they are correct.

(**Note:** If it were possible in the future to generate branches automatically and request a review through the Figma REST API, it could be done in one step.)

## Development

For local development, follow these steps:

1. **Install Dependencies:**
   ```bash
   npm install
   ```
2. **Run the Script Locally:** You can run the script locally for testing or development purposes using:
    ```bash
    npm run start
    ```
3. **Build Before Committing:** Before committing any changes, ensure the script is built:
    ```bash
    npm run build
    ```

### Token yaml format

The script uses a custom format to ingest the tokens. Each file is for a Figma collection, each collection contains a variable, each variable contains a mode, and each mode contains a value. Values can be aliased to other values with the syntax `{collection$variableName}`.

Example:
```yaml
path/name/for/variable:
  Mode1: 123
  Mode2: 456
another/path/for/variable:
  Mode1: 123
  Mode2: '{other collection$path/name/for/variable}'
```

Variables need to be imported in `imports.ts` and then added in the `index.ts` file. The central tokens first get normalized into this format in `central-import.ts`.

### Notable files
Some short descriptions of some noteworthy files in the repository to help navigate the codebase.

```bash
├── config
│   ├── config.yaml                 # Configuration file for the action
│   ├── hcm.yaml                    # Additional tokens for HCM
│   ├── operating-system.yaml       # Additional tokens for different operating systems
│   └── surface.yaml                # Additional tokens for different surfaces
└── src
    ├── Config.ts                   # Loads the config file and ENV variables
    ├── UpdateConstructor.ts        # Class to construct and submit the Figma API call
    ├── action.yaml                 # Configuration for the github action
    ├── central-import.ts           # Responsible for downloading and normalizing the central tokens file
    ├── imports.ts                  # file that imports other tokens yaml files
    ├── transform
    │   ├── modeDefinitions.ts      # 1. Determines which modes need to be added 
    │   ├── variableDefinitions.ts  # 2. Determines which variables need to be added or deprecated
    │   └── updateVariables.ts      # 3. Updates the value of the variables if neccessary
    └── workflow                    # Utilities for the github actions
```