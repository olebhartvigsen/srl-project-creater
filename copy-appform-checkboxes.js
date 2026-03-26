/**
 * copy-appform-checkboxes.js
 *
 * Read, save, and apply Ansøgningsskema-editor checkbox configurations.
 *
 * MODES
 * ─────
 * Export (save to file):
 *   node copy-appform-checkboxes.js --export --from=2660
 *   node copy-appform-checkboxes.js --export --from=2660 --file=my-config.json
 *
 * Apply from file:
 *   node copy-appform-checkboxes.js --apply --import=data/appform-2660.json --to=2661
 *
 * Direct copy (source → target), optionally also export:
 *   node copy-appform-checkboxes.js --from=2660 --to=2661
 *   node copy-appform-checkboxes.js --from=2660 --to=2661 --export
 *
 * Optional flags (all modes):
 *   --save     Automatically click "Gem" after applying changes
 *   --login    Force a fresh login (ignore cached session)
 */

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');

const baseEditorUrl =
  'https://recruiter.hr-manager.net/Sys/DesktopDefault.aspx?tabalias=appformeditor&ApplicationFormId=';
const storageStatePath = path.join(__dirname, '.auth', 'talentech-storage-state.json');
const dataDir = path.join(__dirname, 'data');
const browserCandidates = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

// --- CLI args ---
function getArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

const modeExport = process.argv.includes('--export');
const modeApply = process.argv.includes('--apply');
const sourceId = getArg('from');
const targetId = getArg('to');
const importFile = getArg('import');
const customFile = getArg('file');
const autoSave = process.argv.includes('--save');
const forceLogin = process.argv.includes('--login');

// Validate argument combinations
if (modeApply) {
  if (!importFile || !targetId) {
    console.error('Apply mode requires: --apply --import=<file> --to=<id>');
    process.exit(1);
  }
} else if (modeExport && !targetId) {
  // Export-only mode
  if (!sourceId) {
    console.error('Export mode requires: --export --from=<id> [--file=<name>]');
    process.exit(1);
  }
} else {
  // Direct copy mode (with optional export)
  if (!sourceId || !targetId) {
    console.error(
      'Usage:\n' +
      '  --export --from=<id> [--file=<name>]          Save form config to data/\n' +
      '  --apply  --import=<file> --to=<id>            Apply saved config to form\n' +
      '  --from=<id> --to=<id> [--export] [--save]     Direct copy (optionally also export)',
    );
    process.exit(1);
  }
}

// --- Helpers (same pattern as other scripts) ---
async function waitForUser(message) {
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question(`${message}\nPress Enter to continue...`);
  } finally {
    rl.close();
  }
}

function getLaunchOptions() {
  const executablePath = browserCandidates.find((c) => fs.existsSync(c));
  if (executablePath) {
    console.log(`Using local browser: ${executablePath}`);
    return { executablePath, headless: false, slowMo: 80 };
  }
  console.log('No local Chrome-compatible browser found. Using Playwright Chromium.');
  return { headless: false, slowMo: 80 };
}

function hasSavedSession() {
  return fs.existsSync(storageStatePath);
}

function ensureStorageStateDirectory() {
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
}

async function createContext(browser) {
  if (hasSavedSession() && !forceLogin) {
    console.log(`Reusing saved session: ${storageStatePath}`);
    return browser.newContext({ storageState: storageStatePath });
  }
  if (forceLogin) {
    console.log('Ignoring saved session because --login was provided.');
  } else {
    console.log('No saved session found. A manual login will be required.');
  }
  return browser.newContext();
}

async function ensureLoggedIn(page, firstUrl) {
  if (!hasSavedSession() || forceLogin) {
    console.log('\nPlease log in manually in the browser window that just opened.');
    await page.goto(firstUrl);
    await waitForUser('Complete the login, then come back here.');
    ensureStorageStateDirectory();
    await page.context().storageState({ path: storageStatePath });
    console.log(`Session saved to ${storageStatePath}`);
  }
}

// --- Data file helpers ---

function resolveDataFilePath(id, customName) {
  fs.mkdirSync(dataDir, { recursive: true });
  const filename = customName
    ? path.basename(customName.endsWith('.json') ? customName : `${customName}.json`)
    : `appform-${id}.json`;
  return path.join(dataDir, filename);
}

function saveStatesToFile(filePath, metadata, states) {
  const data = {
    ...metadata,
    exportedAt: new Date().toISOString(),
    checkboxes: states,
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\n     Saved to: ${path.relative(process.cwd(), filePath)}`);
  console.log(`     Checkboxes stored: ${Object.keys(states).length}`);
}

function loadStatesFromFile(filePath) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  console.log(`     Loaded: ${resolved}`);
  if (data.sourceId) console.log(`     Source form ID: ${data.sourceId}`);
  if (data.formName) console.log(`     Form name:      ${data.formName}`);
  if (data.exportedAt) console.log(`     Exported at:    ${data.exportedAt}`);
  return data.checkboxes;
}

// --- Core logic ---

/**
 * Extract all non-disabled checkbox states from the current page,
 * keyed by their `name` attribute. Skips duplicates (nested tables
 * cause the same checkbox to appear in multiple rows).
 */
async function readCheckboxStates(page) {
  return page.evaluate(() => {
    const seen = new Set();
    const states = {};
    document.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      if (!cb.name || seen.has(cb.name)) return;
      seen.add(cb.name);
      states[cb.name] = { checked: cb.checked, disabled: cb.disabled };
    });
    return states;
  });
}

/**
 * Apply checkbox states to the current page.
 * Only clicks checkboxes that need to change state and are not disabled.
 * Returns a summary { changed, skippedDisabled, notFound }.
 */
async function applyCheckboxStates(page, states) {
  return page.evaluate((states) => {
    let changed = 0;
    let skippedDisabled = 0;
    let notFound = 0;
    const details = [];

    for (const [name, { checked }] of Object.entries(states)) {
      const cb = document.querySelector(`input[name="${CSS.escape(name)}"]`);
      if (!cb) {
        // Try without CSS.escape (some names have special chars)
        const all = document.querySelectorAll('input[type="checkbox"]');
        const match = Array.from(all).find((el) => el.name === name);
        if (!match) {
          notFound++;
          details.push(`NOT FOUND: ${name}`);
          continue;
        }
        if (match.disabled) {
          skippedDisabled++;
          continue;
        }
        if (match.checked !== checked) {
          match.click();
          changed++;
          details.push(`CHANGED: ${name} → ${checked}`);
        }
        continue;
      }
      if (cb.disabled) {
        skippedDisabled++;
        continue;
      }
      if (cb.checked !== checked) {
        cb.click();
        changed++;
        details.push(`CHANGED: ${name} → ${checked}`);
      }
    }
    return { changed, skippedDisabled, notFound, details };
  }, states);
}

// --- Main ---
(async () => {
  const browser = await chromium.launch(getLaunchOptions());
  const context = await createContext(browser);
  const page = await context.newPage();

  try {
    // ── APPLY FROM FILE mode ─────────────────────────────────────────────────
    if (modeApply) {
      const targetUrl = baseEditorUrl + targetId;

      console.log(`\n[1/3] Loading config from file…`);
      const states = loadStatesFromFile(importFile);

      console.log(`\n[2/3] Opening target form (ID: ${targetId})…`);
      await page.goto(targetUrl, { waitUntil: 'networkidle' });
      await ensureLoggedIn(page, targetUrl);
      if (!page.url().includes('appformeditor')) {
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
      }
      console.log(`     Loaded: ${await page.title()}`);
      await page.waitForSelector('input[type="checkbox"]', { timeout: 10000 });

      console.log('\n[3/3] Applying checkbox states…');
      const result = await applyCheckboxStates(page, states);
      printApplyResult(result);
      await handleSave(page, autoSave, waitForUser);

    // ── EXPORT ONLY mode ─────────────────────────────────────────────────────
    } else if (modeExport && !targetId) {
      const sourceUrl = baseEditorUrl + sourceId;

      console.log(`\n[1/2] Opening source form (ID: ${sourceId})…`);
      await page.goto(sourceUrl, { waitUntil: 'networkidle' });
      await ensureLoggedIn(page, sourceUrl);
      if (!page.url().includes('appformeditor')) {
        await page.goto(sourceUrl, { waitUntil: 'networkidle' });
      }
      const formName = await getFormName(page);
      console.log(`     Loaded: ${await page.title()}`);

      console.log('\n[2/2] Reading and saving checkbox states…');
      const states = await readCheckboxStates(page);
      const filePath = resolveDataFilePath(sourceId, customFile);
      saveStatesToFile(filePath, { sourceId, formName }, states);

    // ── DIRECT COPY mode (with optional export) ───────────────────────────────
    } else {
      const sourceUrl = baseEditorUrl + sourceId;
      const targetUrl = baseEditorUrl + targetId;
      const totalSteps = modeExport ? 5 : 4;

      console.log(`\n[1/${totalSteps}] Opening source form (ID: ${sourceId})…`);
      await page.goto(sourceUrl, { waitUntil: 'networkidle' });
      await ensureLoggedIn(page, sourceUrl);
      if (!page.url().includes('appformeditor')) {
        await page.goto(sourceUrl, { waitUntil: 'networkidle' });
      }
      const formName = await getFormName(page);
      console.log(`     Loaded: ${await page.title()}`);

      console.log(`\n[2/${totalSteps}] Reading checkbox states…`);
      const states = await readCheckboxStates(page);
      printReadResult(states);

      if (modeExport) {
        console.log(`\n[3/${totalSteps}] Saving config to file…`);
        const filePath = resolveDataFilePath(sourceId, customFile);
        saveStatesToFile(filePath, { sourceId, formName }, states);
      }

      const applyStep = modeExport ? 4 : 3;
      console.log(`\n[${applyStep}/${totalSteps}] Opening target form (ID: ${targetId})…`);
      await page.goto(targetUrl, { waitUntil: 'networkidle' });
      console.log(`     Loaded: ${await page.title()}`);
      await page.waitForSelector('input[type="checkbox"]', { timeout: 10000 });

      console.log(`\n[${applyStep + 1}/${totalSteps}] Applying checkbox states…`);
      const result = await applyCheckboxStates(page, states);
      printApplyResult(result);
      await handleSave(page, autoSave, waitForUser);
    }

    // Persist any session changes
    ensureStorageStateDirectory();
    await context.storageState({ path: storageStatePath });
  } catch (err) {
    console.error('\nError:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();

// --- Shared output helpers ---

async function getFormName(page) {
  try {
    return await page.inputValue('input[name*="TextBox_AppFormName"], input[id*="TextBox_AppFormName"]');
  } catch {
    return undefined;
  }
}

function printReadResult(states) {
  const total = Object.keys(states).length;
  const checked = Object.values(states).filter((s) => s.checked).length;
  console.log(`     Found ${total} checkboxes — ${checked} checked, ${total - checked} unchecked`);
}

function printApplyResult(result) {
  console.log(`     Changed:           ${result.changed}`);
  console.log(`     Skipped (disabled): ${result.skippedDisabled}`);
  console.log(`     Not found:         ${result.notFound}`);
  if (result.details.length > 0) {
    console.log('\n     Details:');
    result.details.forEach((d) => console.log(`       ${d}`));
  }
}

async function handleSave(page, autoSave, waitForUser) {
  if (autoSave) {
    console.log('\nClicking "Gem" to save…');
    const gemButton = page.locator('input[type="submit"][value*="Gem"], button:has-text("Gem")').first();
    await gemButton.click();
    await page.waitForLoadState('networkidle');
    console.log('     Saved successfully.');
  } else {
    console.log('\nChanges applied but NOT saved. Review in the browser, then click "Gem" manually.');
    console.log('(Run with --save to save automatically.)');
    await waitForUser('Press Enter when done to close the browser.');
  }
}
