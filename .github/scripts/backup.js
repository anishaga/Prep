const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const BACKUP_REPO = process.env.BACKUP_REPO;             // "yourusername/prep-backups"
const BACKUP_REPO_TOKEN = process.env.BACKUP_REPO_TOKEN; // fine-grained PAT, scoped to that repo only

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

async function pushToBackupRepo(fileName, contentStr) {
  const url = `https://api.github.com/repos/${BACKUP_REPO}/contents/${fileName}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${BACKUP_REPO_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Backup ${fileName}`,
      content: Buffer.from(contentStr).toString('base64'),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }
}

async function main() {
  if (!BACKUP_REPO || !BACKUP_REPO_TOKEN) {
    throw new Error('BACKUP_REPO or BACKUP_REPO_TOKEN is not set.');
  }

  const backup = await fetchBackupData();
  const dateStr = backup.exportedAt.slice(0, 10);
  const fileName = `prep-backup-${dateStr}.json`;
  const contentStr = JSON.stringify(backup, null, 2);

  fs.writeFileSync(fileName, contentStr);
  console.log('Backup prepared locally:', fs.statSync(fileName).size, 'bytes');

  await pushToBackupRepo(fileName, contentStr);
  console.log('Pushed to backup repo as', fileName);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});