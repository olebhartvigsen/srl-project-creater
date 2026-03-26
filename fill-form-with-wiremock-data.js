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

function loadAllAvailableJobPostings() {
  const jobPostingsPath = path.join(__dirname, 'wiremock', '__files', 'job-postings-list.json');
  const jobPostingsData = JSON.parse(fs.readFileSync(jobPostingsPath, 'utf-8'));

  if (jobPostingsData.jobPostings.length === 0) {
    throw new Error('No job postings found in wiremock data');
  }

  // Only include postings that have a matching recruitment-process file.
  const available = jobPostingsData.jobPostings.filter((jp) => {
    const recruitmentPath = path.join(
      __dirname,
      'wiremock',
      '__files',
      `recruitment-process-${jp.recruitmentId}.json`,
    );
    return fs.existsSync(recruitmentPath);
  });

  console.log(`📋 Found ${available.length} job postings with recruitment-process data`);
  return available;
}

function pickRandom(arr, count) {
  const shuffled = arr.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

function loadRecruitmentProcess(recruitmentId) {
  const recruitmentPath = path.join(
    __dirname,
    'wiremock',
    '__files',
    `recruitment-process-${recruitmentId}.json`
  );
  
  if (!fs.existsSync(recruitmentPath)) {
    throw new Error(`Recruitment process file not found: ${recruitmentPath}`);
  }
  
  const recruitmentData = JSON.parse(fs.readFileSync(recruitmentPath, 'utf-8'));
  console.log(`✅ Loaded recruitment process data for ID: ${recruitmentId}`);
  
  return recruitmentData.recruitment;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatInlineText(value) {
  let html = escapeHtml(value);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi, '<a href="mailto:$1">$1</a>');
  return html;
}

function formatTechnicalTextAsHtml(text) {
  if (!text) {
    return '';
  }

  if (/<\/?[a-z][\s\S]*>/i.test(text)) {
    return text;
  }

  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  if (!normalized) {
    return '';
  }

  const knownHeadings = new Set([
    'project',
    'position and qualifications',
    'work environment',
    'who we are',
    'international applicants',
    'contact',
    'application deadline',
    'place of work',
    'terms of employment',
    'application procedure',
    'the evaluation process',
    'projekt',
    'stilling og kvalifikationer',
    'arbejdsmiljø',
    'hvem er vi',
    'internationale ansøgere',
    'ansøgningsfrist',
    'arbejdssted',
    'ansættelsesvilkår',
    'ansøgningsprocedure',
    'evalueringsprocessen',
  ]);

  const lines = normalized.split('\n').map((line) => line.trim());
  const blocks = [];
  let current = [];

  for (const line of lines) {
    if (!line) {
      if (current.length) {
        blocks.push(current.join(' ').trim());
        current = [];
      }
      continue;
    }

    const isHeading = (() => {
      const lower = line.toLowerCase();
      if (knownHeadings.has(lower)) {
        return true;
      }
      if (line.length > 80) {
        return false;
      }
      if (/[.!?:]$/.test(line)) {
        return false;
      }
      const words = line.split(/\s+/);
      if (words.length > 8) {
        return false;
      }
      const capitalizedWords = words.filter((word) => /^[A-ZÆØÅ][\p{L}-]*$/u.test(word)).length;
      return capitalizedWords >= Math.max(1, Math.ceil(words.length / 2));
    })();

    if (isHeading && current.length) {
      blocks.push(current.join(' ').trim());
      current = [];
    }

    if (isHeading) {
      blocks.push({ type: 'heading', text: line });
    } else {
      current.push(line);
    }
  }

  if (current.length) {
    blocks.push(current.join(' ').trim());
  }

  const htmlParts = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (typeof block === 'object' && block.type === 'heading') {
      htmlParts.push(`<h2>${formatInlineText(block.text)}</h2>`);
      continue;
    }

    const textBlock = String(block).trim();
    if (!textBlock) {
      continue;
    }

    const nextBlock = blocks[index + 1];
    const looksLikeListIntro = /:\s*$/.test(textBlock);
    const rawLines = textBlock.split(/\s{2,}|\n/).map((line) => line.trim()).filter(Boolean);
    const likelyListItems = rawLines.length >= 3 && rawLines.every((line) => line.length < 180 && !/[.!?]$/.test(line));

    if (looksLikeListIntro && typeof nextBlock === 'string') {
      htmlParts.push(`<p>${formatInlineText(textBlock)}</p>`);
      continue;
    }

    if (likelyListItems) {
      htmlParts.push('<ul>');
      for (const item of rawLines) {
        htmlParts.push(`<li>${formatInlineText(item)}</li>`);
      }
      htmlParts.push('</ul>');
      continue;
    }

    htmlParts.push(`<p>${formatInlineText(textBlock)}</p>`);
  }

  return [
    '<div class="job-posting-body">',
    ...htmlParts,
    '</div>',
  ].join('');
}

async function fillFormWithData(page, recruitment) {
  console.log('\n🔍 Analyzing form fields...');
  
  const jobPosting = recruitment.jobPosting;
  const employment = recruitment.employment;
  const organization = recruitment.organization;
  const position = recruitment.position;
  const address = recruitment.address;
  const startDate = employment?.period?.startDate;
  const applicationDeadline = jobPosting?.applicationDeadline;
  const hoursPerWeek = Number(employment?.hoursPerWeek ?? 37);
  const workTimeType = hoursPerWeek === 37 ? 'fuldtid' : 'deltid';
  const postingLanguages = Array.isArray(jobPosting?.languages) ? jobPosting.languages : [];
  const mainLanguage = postingLanguages[0]
    || (jobPosting?.titleEn && !jobPosting?.titleDa ? 'en' : null)
    || (jobPosting?.titleDa && !jobPosting?.titleEn ? 'da' : null)
    || 'en';

  const toDateInputValue = (value) => {
    if (!value) {
      return '';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const toDateDisplayValue = (value) => {
    if (!value) {
      return '';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    return `${day}-${month}-${year}`;
  };
  
  // Get all form inputs to understand the structure
  const inputs = await page.locator('input, textarea, select, [role="combobox"]').all();
  console.log(`Found ${inputs.length} form fields`);
  
  // Attempt to detect and fill common fields
  const fieldsToFill = [];
  
  // Attempt to detect and fill specific fields
  try {
    // Language checkboxes: only one should be selected based on the posting's main language.
    const englishLanguageCheckbox = page.locator('#ctl00_Content_Main_ctl01_ctl00_HrmWizard_ProjectWizard_ctl03_ProjectLanguages_Ctrl_CheckBoxList_AppLang_0').first();
    const danishLanguageCheckbox = page.locator('#ctl00_Content_Main_ctl01_ctl00_HrmWizard_ProjectWizard_ctl03_ProjectLanguages_Ctrl_CheckBoxList_AppLang_1').first();

    if (await englishLanguageCheckbox.count() && await danishLanguageCheckbox.count()) {
      const selectEnglish = String(mainLanguage).toLowerCase().startsWith('en');

      await englishLanguageCheckbox.setChecked(selectEnglish);
      await danishLanguageCheckbox.setChecked(!selectEnglish);

      fieldsToFill.push({ field: 'Language', value: selectEnglish ? 'English' : 'Dansk' });
      console.log(`✓ Language selected: ${selectEnglish ? 'English' : 'Dansk'}`);
    } else {
      console.log('Could not find project language checkboxes');
    }
  } catch (e) {
    console.log('Could not set project language checkboxes');
  }

  try {
    // Look for project name field - Danish: "Projektnavn"
    const projectNameField = await page.locator('input[placeholder*="projektnavn" i], input[placeholder*="project" i], input[name*="projektnavn" i], input[name*="projectname" i]').first();
    if (await projectNameField.isVisible()) {
      const projectName = jobPosting.titleEn || jobPosting.titleDa || '';
      await projectNameField.fill(projectName);
      fieldsToFill.push({ field: 'Projektnavn', value: projectName.substring(0, 50) });
    }
  } catch (e) {
    console.log('Could not fill project name field');
  }
  
  // Attempt to detect and fill common fields (continued in full file...)
}

async function main() {
  try {
    const batchCount = 10;
    console.log(`🚀 Starting batch run: ${batchCount} random job postings...\n`);

    const allPostings = loadAllAvailableJobPostings();
    const picked = pickRandom(allPostings, batchCount);
    console.log(
      `🎲 Picked ${picked.length} random postings:\n${picked.map((p, i) => `   ${i + 1}. ID ${p.recruitmentId} – ${p.titleEn || p.titleDa}`).join('\n')}\n`,
    );

    // Launch browser and context once; reuse across all iterations.
    const browser = await chromium.launch(getLaunchOptions());
    const context = await createContext(browser);

    const results = [];

    for (let i = 0; i < picked.length; i++) {
      const jobPosting = picked[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔄 POSTING ${i + 1}/${picked.length}: ID ${jobPosting.recruitmentId}`);
      console.log(`   ${jobPosting.titleEn || jobPosting.titleDa}`);
      console.log('='.repeat(60));

      const page = await context.newPage();
      try {
        // Full implementation in repository
        results.push({ id: jobPosting.recruitmentId, status: 'ok' });
      } catch (err) {
        console.error(`\n❌ POSTING ${i + 1} FAILED: ${err.message}`);
        results.push({ id: jobPosting.recruitmentId, status: 'error', error: err.message });
      } finally {
        await page.close();
      }
    }

    await context.close();
    await browser.close();

    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 BATCH COMPLETED');
    console.log('='.repeat(60));
    console.log(`Total: ${results.length}`);
    console.log(`Success: ${results.filter(r => r.status === 'ok').length}`);
    console.log(`Failed: ${results.filter(r => r.status === 'error').length}`);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exitCode = 1;
  }
}

main();