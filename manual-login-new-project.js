const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');

const baseUrl = 'https://talentech-recruiter.hr-manager.net/recruitment/index';
const storageStatePath = path.join(__dirname, '.auth', 'talentech-storage-state.json');
const browserCandidates = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const forceLogin = process.argv.includes('--login');

async function waitForUser(message) {
  const rl = readline.createInterface({ input, output });

  try {
    await rl.question(`${message}\nPress Enter to continue...`);
  } finally {
    rl.close();
  }
}

function getLaunchOptions() {
  const executablePath = browserCandidates.find((candidate) => fs.existsSync(candidate));

  if (executablePath) {
    console.log(`Using local browser: ${executablePath}`);

    return {
      executablePath,
      headless: false,
      slowMo: 50,
    };
  }

  console.log('No local Chrome-compatible browser detected. Falling back to Playwright Chromium.');

  return {
    headless: false,
    slowMo: 50,
  };
}

function hasSavedSession() {
  return fs.existsSync(storageStatePath);
}

function ensureStorageStateDirectory() {
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
}

async function createContext(browser) {
  const useStoredSession = hasSavedSession() && !forceLogin;

  if (useStoredSession) {
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

async function saveSession(context) {
  ensureStorageStateDirectory();
  await context.storageState({ path: storageStatePath });
  console.log(`Saved session state to ${storageStatePath}`);
}

async function handleLoginIfNeeded(page, context) {
  const usingStoredSession = hasSavedSession() && !forceLogin;

  if (usingStoredSession) {
    return;
  }

  console.log('If authentication is required, complete the login flow in the browser window.');
  await waitForUser('Log in manually if needed on the base page, then press Enter to continue.');

  await saveSession(context);
}

async function main() {
  const browser = await chromium.launch(getLaunchOptions());

  const context = await createContext(browser);
  const page = await context.newPage();

  try {
    console.log(`Opening ${baseUrl}`);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

    await handleLoginIfNeeded(page, context);

    console.log('Clicking "Opret projekt" button...');
    await page.getByRole('button', { name: 'Opret projekt' }).click();

    console.log('Clicking "Opret projekt" sub-menu link...');
    await page.getByRole('link', { name: 'Opret projekt' }).click();

    await page.waitForLoadState('domcontentloaded');

    console.log(`Current page: ${page.url()}`);
    console.log(`Page title: ${await page.title()}`);
    console.log('Use `npm run new-project:login` to force a fresh login and replace the saved session.');

    await waitForUser('The browser will stay open so you can verify the page.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});