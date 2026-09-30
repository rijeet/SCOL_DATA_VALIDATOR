/**
 * Upload every university under reference/uk-uni (or ./UK UNI) to Cloudinary (SCOL_DATA/{uni}/...).
 *
 * Uses Cloudinary `folder` + nested `public_id` so assets live under SCOL_DATA,
 * creates folder records via Admin API, and uploads a root marker file.
 *
 * Uploads only:
 *   - *_reviewed.csv at university root
 *   - clean/uni/bangladesh-entry.md, deposit.md, english-requirements.md, scholarships.md
 *
 * Usage:
 *   node -r ./load-env.js scripts/upload-uk-uni-to-cloudinary.mjs
 *   node -r ./load-env.js scripts/upload-uk-uni-to-cloudinary.mjs --dry-run
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const ukUniCandidates = [
  path.join(projectRoot, 'reference', 'uk-uni'),
  path.join(projectRoot, 'UK UNI'),
];
const ukUniRoot =
  ukUniCandidates.find((p) => fs.existsSync(p)) ?? ukUniCandidates[0];

const ROOT_FOLDER = (process.env.DATA_ENTRY_CLOUD_ROOT ?? 'SCOL_DATA').replace(
  /^\/+|\/+$/g,
  '',
);

const ROOT_MARKER = '_scol_data_root';

const HELPER_REL_PATHS = [
  'clean/uni/bangladesh-entry.md',
  'clean/uni/deposit.md',
  'clean/uni/english-requirements.md',
  'clean/uni/scholarships.md',
];

const dryRun = process.argv.includes('--dry-run');

function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET in .env',
    );
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

/** public_id segment under the university folder (no leading slash, no extension). */
function toPublicId(relativePath) {
  const rel = relativePath.replace(/\\/g, '/');
  return rel.replace(/\.[^./]+$/i, '');
}

function uniFolder(uniName) {
  return `${ROOT_FOLDER}/${uniName}`;
}

function isBenignFolderError(err) {
  const code = err?.http_code;
  const msg = String(err?.message ?? err).toLowerCase();
  return (
    code === 409 ||
    code === 400 ||
    msg.includes('already exists') ||
    msg.includes('already exist') ||
    msg.includes('exist')
  );
}

async function ensureFolder(folderPath) {
  if (dryRun) {
    console.log(`[dry-run] would ensure folder → ${folderPath}`);
    return;
  }
  try {
    await cloudinary.api.create_folder(folderPath);
  } catch (err) {
    if (!isBenignFolderError(err)) {
      console.warn(
        `  note: create_folder(${folderPath}): ${err?.message ?? err}`,
      );
    }
  }
}

async function ensureScolDataRoot() {
  const markerPublicId = `${ROOT_FOLDER}/${ROOT_MARKER}`;
  if (dryRun) {
    console.log(`[dry-run] would ensure root marker → ${markerPublicId}`);
    await ensureFolder(ROOT_FOLDER);
    return;
  }

  await ensureFolder(ROOT_FOLDER);

  try {
    await cloudinary.api.resource(markerPublicId, { resource_type: 'raw' });
    return;
  } catch {
    /* upload marker below */
  }

  const readme = [
    'SCOL data-entry root folder.',
    'One subfolder per university under this path.',
  ].join('\n');

  await cloudinary.uploader.upload(
    `data:text/plain;base64,${Buffer.from(readme, 'utf8').toString('base64')}`,
    {
      resource_type: 'raw',
      folder: ROOT_FOLDER,
      public_id: ROOT_MARKER,
      overwrite: false,
    },
  );
  console.log(`Root ready: ${ROOT_FOLDER}/ (${markerPublicId})`);
}

function findReviewedCsv(uniDir) {
  const files = fs.readdirSync(uniDir, { withFileTypes: true });
  return files
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.csv'))
    .map((e) => e.name)
    .filter((name) => name.includes('_reviewed'));
}

async function uploadFile(localPath, uniName, relativePath) {
  const folder = uniFolder(uniName);
  const publicId = toPublicId(relativePath);
  const displayPath = `${folder}/${publicId}`;

  if (dryRun) {
    console.log(`[dry-run] would upload → ${displayPath}`);
    return;
  }

  const result = await cloudinary.uploader.upload(localPath, {
    resource_type: 'raw',
    folder,
    public_id: publicId,
    overwrite: true,
    invalidate: true,
  });
  console.log(`  ✓ ${result.public_id ?? displayPath} (${result.bytes ?? '?'} bytes)`);
}

async function uploadUniversity(uniName) {
  const uniDir = path.join(ukUniRoot, uniName);
  console.log(`\n▶ ${uniName}`);

  await ensureFolder(uniFolder(uniName));

  const reviewed = findReviewedCsv(uniDir);
  if (reviewed.length === 0) {
    console.warn('  ⚠ no *_reviewed.csv — skipped CSV');
  } else if (reviewed.length > 1) {
    console.warn(`  ⚠ multiple reviewed CSVs, using first: ${reviewed[0]}`);
  }
  if (reviewed.length > 0) {
    const csvName = reviewed[0];
    await uploadFile(path.join(uniDir, csvName), uniName, csvName);
  }

  for (const rel of HELPER_REL_PATHS) {
    const local = path.join(uniDir, rel);
    if (!fs.existsSync(local)) {
      console.warn(`  ⚠ missing ${rel}`);
      continue;
    }
    await uploadFile(local, uniName, rel);
  }
}

async function main() {
  if (!fs.existsSync(ukUniRoot)) {
    throw new Error(
      `UK UNI folder not found. Expected reference/uk-uni or UK UNI under: ${projectRoot}`,
    );
  }

  configureCloudinary();
  await ensureScolDataRoot();

  const universities = fs
    .readdirSync(ukUniRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));

  console.log(
    `${dryRun ? '[dry-run] ' : ''}Uploading ${universities.length} universities → Cloudinary folder "${ROOT_FOLDER}/"`,
  );

  let ok = 0;
  let failed = 0;
  for (const uni of universities) {
    try {
      await uploadUniversity(uni);
      ok++;
    } catch (err) {
      failed++;
      console.error(`  ✗ failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nDone. ${ok} universities processed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
