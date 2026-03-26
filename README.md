# SRL Project Creator

Automation tools for managing Talentech recruitment projects using Playwright and WireMock data.

## Overview

This project provides command-line tools for:

- **Manual login & project creation** — Set up new recruitment projects interactively
- **Form data filling** — Populate forms with WireMock test data
- **Application form configuration** — Copy form checkbox settings between forms or save/restore from files

## Features

### 1. Manual Project Creation (`manual-login-new-project.js`)

Interactive script to create new recruitment projects with browser automation:

```bash
npm run srl-create-project        # Use saved session or log in
npm run srl-create-project:login  # Force fresh login
```

### 2. Form Data Filling (`fill-form-with-wiremock-data.js`)

Automatically fill application forms with test data from WireMock:

```bash
npm run srl-create-project:fill
```

### 3. Application Form Configuration (`copy-appform-checkboxes.js`)

Manage Ansøgningsskema-editor checkbox configurations across forms:

#### Export form settings to file
```bash
node copy-appform-checkboxes.js --export --from=2660
node copy-appform-checkboxes.js --export --from=2660 --file=my-config
```

#### Apply settings from file
```bash
node copy-appform-checkboxes.js --apply --import=data/appform-2660.json --to=2661 --save
```

#### Direct copy between forms
```bash
node copy-appform-checkboxes.js --from=2660 --to=2661
node copy-appform-checkboxes.js --from=2660 --to=2661 --export --save  # Also save config
```

#### Supported flags
- `--save` — Auto-click "Gem" (save) after applying changes
- `--login` — Force fresh login (ignore cached session)

## Data Files

Application form configurations are saved to `data/` as JSON files:

```json
{
  "sourceId": "2660",
  "formName": "Standard ansøgningsskema",
  "exportedAt": "2026-03-26T21:53:00.000Z",
  "checkboxes": {
    "ctl00$...$CheckBox_Visible": { "checked": true, "disabled": false },
    ...
  }
}
```

These files can be:
- Version controlled in git
- Re-applied to forms at any time
- Used as templates for new forms

## WireMock Integration

The `wiremock/` folder contains:
- `__files/` — Mock JSON responses for job postings and recruitment processes
- `mappings/` — WireMock request/response mappings

## Installation

```bash
npm install
```

Requires:
- Node.js 18+
- Chrome, Edge, or Chromium browser (or will use Playwright's bundled Chromium)
- Access to: https://recruiter.hr-manager.net/

## Authentication

Sessions are automatically cached in `.auth/talentech-storage-state.json` after first login.

Used by all scripts:
- First run: Browser opens → you log in manually → session saved
- Subsequent runs: Session reused automatically
- Override: Use `--login` flag to force fresh login

## Project Scripts

```json
{
  "srl-create-project": "Manual project creation (interactive)",
  "srl-create-project:login": "Force fresh login",
  "srl-create-project:fill": "Fill forms with test data",
  "copy-appform": "Run copy-appform-checkboxes.js directly",
  "copy-appform:export": "Shortcut for export mode",
  "copy-appform:apply": "Shortcut for apply mode"
}
```

## License

Provate project for Talentech recruitment system management.
