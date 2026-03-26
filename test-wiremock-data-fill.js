const fs = require('node:fs');
const path = require('node:path');

/**
 * This script demonstrates how wiremock data can be used to fill the project creation form
 */

function loadJobPostingData() {
  const jobPostingsPath = path.join(__dirname, 'wiremock', '__files', 'job-postings-list.json');
  const jobPostingsData = JSON.parse(fs.readFileSync(jobPostingsPath, 'utf-8'));
  
  if (jobPostingsData.jobPostings.length === 0) {
    throw new Error('No job postings found in wiremock data');
  }
  
  return jobPostingsData.jobPostings[0];
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
  return recruitmentData.recruitment;
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('da-DK');
}

function main() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  Project Creation Form - Mock Data Population Demo      ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    // Load wiremock data
    const jobPosting = loadJobPostingData();
    console.log('📋 STEP 1: Loading Job Posting Data');
    console.log('─'.repeat(60));
    console.log(`   Recruitment ID: ${jobPosting.recruitmentId}`);
    console.log(`   Job ID: ${jobPosting.jobPostingId}`);
    console.log(`   Title (EN): ${jobPosting.titleEn}`);
    console.log(`   Title (DA): ${jobPosting.titleDa}`);
    console.log(`   Department: ${jobPosting.departmentNameEn}`);
    console.log(`   Position Type: ${jobPosting.positionTypeEn}`);
    console.log(`   Publication Date: ${formatDate(jobPosting.publicationDate)}`);
    console.log(`   Application Deadline: ${formatDate(jobPosting.applicationDeadline)}`);
    console.log(`   Languages: ${jobPosting.languages.join(', ')}`);
    
    const recruitment = loadRecruitmentProcess(jobPosting.recruitmentId);
    
    console.log('\n📋 STEP 2: Loading Recruitment Process Details');
    console.log('─'.repeat(60));
    
    const emp = recruitment.employment;
    const org = recruitment.organization;
    const pos = recruitment.position;
    const addr = recruitment.address;
    const jobDesc = recruitment.jobPosting.descriptionEn;
    
    console.log(`   Organization: ${org.departmentNameEn} (${org.departmentNameDa})`);
    console.log(`   Department Code: ${org.departmentCode}`);
    console.log(`   Position Type Code: ${pos.positionTypeCode}`);
    console.log(`   Position: ${pos.positionTypeEn} (${pos.positionTypeDa})`);
    console.log(`   Hours per Week: ${emp.hoursPerWeek}`);
    console.log(`   City: ${addr.city}`);
    console.log(`   Postal Code: ${addr.postalCode}`);
    console.log(`   Description Length: ${jobDesc.technicalText?.length} characters`);
    
    console.log('\n✏️  STEP 3: Form Fields to Populate (extracted from data)');
    console.log('─'.repeat(60));
    
    const formData = {
      'Title (English)': jobPosting.titleEn,
      'Title (Danish)': jobPosting.titleDa || '[Not provided in data]',
      'Short Text (English)': jobPosting.shortTextEn,
      'Short Text (Danish)': jobPosting.shortTextDa || '[Not provided in data]',
      'Department': org.departmentNameEn,
      'Department (DK)': org.departmentNameDa,
      'Position Type': pos.positionTypeEn,
      'Position Type (DK)': pos.positionTypeDa,
      'Hours Per Week': emp.hoursPerWeek.toString(),
      'City': addr.city,
      'Postal Code': addr.postalCode.toString(),
      'Application Link': jobPosting.applicationLink,
      'Application Deadline': formatDate(jobPosting.applicationDeadline),
    };
    
    Object.entries(formData).forEach(([key, value]) => {
      const displayValue = value.length > 60 
        ? value.substring(0, 57) + '...' 
        : value;
      console.log(`   ✓ ${key.padEnd(25)}: ${displayValue}`);
    });
    
    console.log('\n📊 STEP 4: Description Preview');
    console.log('─'.repeat(60));
    if (jobDesc && jobDesc.technicalText) {
      const preview = jobDesc.technicalText.substring(0, 300);
      console.log(`   ${preview}...\n   [Article continues for ${jobDesc.technicalText.length} total characters]\n`);
    }
    
    console.log('🎯 STEP 5: Summary');
    console.log('─'.repeat(60));
    console.log(`   ✓ Core fields populated: 12+`);
    console.log(`   ✓ Using real mock data from wiremock`);
    console.log(`   ✓ Data is bilingual (EN/DA)`);
    console.log(`   ✓ Document ready for project creation`);
    console.log(`   ✓ NO data saved - as requested\n`);
    
    console.log('💡 NOTE: In the actual script, this data would be entered into');
    console.log('   the form fields using Playwright automation.\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  }
}

main();