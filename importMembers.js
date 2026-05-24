// TSA Member Import Script
// Reads Wild Apricot CSV export and creates Firebase Auth + Firestore member records
// Run with: node importMembers.js <path-to-csv-file>
// Example:  node importMembers.js members.csv

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// ── CONFIGURATION ─────────────────────────────────────────────────────────────
const TEMP_PASSWORD = 'TSAFlight2025!';  // All members get this temp password
const SERVICE_ACCOUNT_PATH = './serviceAccount.json'; // Firebase service account key

// Membership levels that indicate youth/cadet members
const YOUTH_LEVELS = ['cadet', 'youth', 'junior'];

// Membership levels that indicate tow pilot only members
const TOW_PILOT_LEVELS = ['tow pilot - only', 'tow pilot only', 'towpilot'];

// ── FIREBASE INIT ─────────────────────────────────────────────────────────────
const serviceAccount = require(SERVICE_ACCOUNT_PATH);
initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

// ── HELPERS ───────────────────────────────────────────────────────────────────
function cleanMemberNumber(raw) {
  if (!raw) return '';
  // Strip slash suffix: "3420/3420a" → "3420"
  return raw.toString().split('/')[0].trim();
}

function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/\r/g, '').replace(/"/g, ''));
  return lines.slice(1).map(line => {
    // Handle quoted fields that may contain commas
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/\r/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/\r/g, ''));
    const record = {};
    headers.forEach((h, i) => { record[h] = values[i] || ''; });
    return record;
  });
}

function getMemberFlags(level, noTow) {
  const levelLower = (level || '').toLowerCase().trim();
  const isTowPilotOnly = TOW_PILOT_LEVELS.some(t => levelLower.includes(t));
  const isYouth = YOUTH_LEVELS.some(y => levelLower.includes(y));
  const isOnNoTowList = noTow && noTow.toLowerCase().trim() === 'yes';

  return {
    isYouthMember: isYouth,
    isTowPilotQualified: isTowPilotOnly,
    isTowPilotCurrent: isTowPilotOnly,
    isCFIQualified: false,
    isCFICurrent: false,
    isOnNoTowList,
    isRideGiverAuthorized: false,
    isDemoRideAccount: false,
    roles: isTowPilotOnly ? ['tow_pilot'] : ['glider_pilot'],
  };
}

// ── MAIN IMPORT ───────────────────────────────────────────────────────────────
async function importMembers(filePath) {
  console.log(`\nReading file: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf8');
  const records = parseCSV(content);
  console.log(`Found ${records.length} member records\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const record of records) {
    const email = record['Email'];
    const firstName = record['First name'];
    const lastName = record['Last name'];
    const memberNumber = cleanMemberNumber(record['TSA Member Number']);
    const wildApricotId = record['User ID'];
    const membershipLevel = record['Membership level'];
    const membershipStatus = record['Membership status'];
    const noTow = record['No Tow'];

    if (!email || !firstName || !lastName) {
      console.log(`⚠️  Skipping record - missing required fields: ${JSON.stringify(record)}`);
      skipped++;
      continue;
    }

    const displayName = `${firstName} ${lastName}`;
    const flags = getMemberFlags(membershipLevel, noTow);

    try {
      // Create Firebase Auth account
      let uid;
      try {
        const userRecord = await auth.createUser({
          email,
          password: TEMP_PASSWORD,
          displayName,
        });
        uid = userRecord.uid;
        console.log(`✅ Created auth: ${displayName} (${email})`);
      } catch (authError) {
        if (authError.code === 'auth/email-already-exists') {
          // User already exists - get their UID
          const existing = await auth.getUserByEmail(email);
          uid = existing.uid;
          console.log(`ℹ️  Auth exists: ${displayName} (${email})`);
        } else {
          throw authError;
        }
      }

      // Create Firestore member document
      await db.collection('members').doc(uid).set({
        uid,
        wildApricotId,
        memberNumber,
        displayName,
        email,
        membershipStatus: membershipStatus || 'Active',
        membershipLevel: membershipLevel || '',
        accountBalance: 0,
        privateGlider: null,
        lastSyncedAt: new Date(),
        ...flags,
      }, { merge: true });

      console.log(`   📋 Firestore: ${memberNumber} - ${displayName} - ${membershipLevel}`);
      created++;

    } catch (error) {
      console.error(`❌ Error importing ${displayName} (${email}): ${error.message}`);
      errors++;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`✅ Created/updated: ${created}`);
  console.log(`⚠️  Skipped:        ${skipped}`);
  console.log(`❌ Errors:          ${errors}`);
  console.log(`─────────────────────────────────────────`);
  console.log(`\nAll members have been given the temporary password: ${TEMP_PASSWORD}`);
  console.log('Please inform members to change their password after first login.\n');
}

// ── RUN ───────────────────────────────────────────────────────────────────────
const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node importMembers.js <path-to-tsv-file>');
  console.error('Example: node importMembers.js members.tsv');
  process.exit(1);
}

importMembers(path.resolve(filePath)).catch(console.error);