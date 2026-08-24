const admin = require('firebase-admin');
const { google } = require('googleapis');
const fs = require('fs');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function fetchBackupData() {
  const db = admin.firestore();
  const trackerSnap = await db.doc('tracker/main').get();
  const journalSnap = await db.doc('journal/entries').get();
  return {
    exportedAt: new Date().toISOString(),
    tracker: trackerSnap.exists ? trackerSnap.data() : null,
    journal: journalSnap.exists ? journalSnap.data() : null,
  };
}

async function uploadToDrive(filePath, fileName) {
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  const drive = google.drive({ version: 'v3', auth });
  await drive.files.create({
    requestBody: { name: fileName, parents: [DRIVE_FOLDER_ID] },
    media: { mimeType: 'application/json', body: fs.createReadStream(filePath) },
    fields: 'id',
  });
}

async function main() {
  if (!DRIVE_FOLDER_ID) throw new Error('DRIVE_FOLDER_ID secret is not set.');

  const backup = await fetchBackupData();
  const dateStr = backup.exportedAt.slice(0, 10);
  const fileName = `prep-backup-${dateStr}.json`;

  fs.writeFileSync(fileName, JSON.stringify(backup, null, 2));
  console.log('Backup written locally:', fs.statSync(fileName).size, 'bytes');

  await uploadToDrive(fileName, fileName);
  console.log('Uploaded to Drive as', fileName);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});