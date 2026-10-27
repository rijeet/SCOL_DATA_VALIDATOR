#!/usr/bin/env node
/**
 * generate-project-snapshot.js
 *
 * Walks a project folder and writes ONE Markdown file with a folder tree plus
 * the content of the project's own source-code files. Everything that is not
 * source code (images, docs, lock files, data, backups, reference copies) is
 * left out, and folders that end up empty are not shown in the tree.
 *
 * USAGE:
 *   node generate-project-snapshot.js [rootPath] [outputFile] [--with-config]
 *
 * EXAMPLES:
 *   node generate-project-snapshot.js
 *   node generate-project-snapshot.js . snapshot.md
 *   node generate-project-snapshot.js "D:\Project Next\SCOL_DATA_VALIDATOR" snapshot.md
 *   node generate-project-snapshot.js . snapshot.md --with-config
 *
 * Options:
 *   --with-config   also include build/config files (package.json, tsconfig*.json,
 *                   vercel.json, nest-cli.json, docker-compose.yml)
 *
 * Defaults:
 *   rootPath   = current directory (".")
 *   outputFile = "project-snapshot.md"
 */

const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const withConfig = args.includes('--with-config');
const positional = args.filter((a) => !a.startsWith('--'));

const rootPath = path.resolve(positional[0] || '.');
const outputFile = path.resolve(positional[1] || 'project-snapshot.md');
const SCRIPT_NAME = path.basename(__filename);

/** Skip files larger than this (bytes) - usually generated or data files. */
const MAX_FILE_BYTES = 300 * 1024;

// Folders never entered
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '.vscode',
  '.idea',
  '.cursor',
  '.temp',
  '.tmp',
  'venv',
  '.venv',
  '__pycache__',
  // project-local, non-source folders
  'reference',
  'docs',
  'uploadUniCourse',
  'BulkImport',
  'BulkData',
  'data-entry-chunks',
  'Code to Chunk',
  'migrations',
]);

/** Folder-name prefixes to skip (backups, change bundles). */
const IGNORE_DIR_PREFIXES = ['_backup_', 'scol-changes', 'scol-reimport', 'scol-export', 'scol-nav'];

// Only these extensions count as source code
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.css', '.scss',
  '.sql',
  '.html',
]);

// Extra files kept only with --with-config
const CONFIG_FILE_PATTERNS = [
  /^package\.json$/,
  /^tsconfig.*\.json$/,
  /^vercel\.json$/,
  /^nest-cli\.json$/,
  /^docker-compose\.ya?ml$/,
];

// Never included, whatever the extension
const IGNORE_FILES = new Set([SCRIPT_NAME, 'newrelic.cjs']);
const IGNORE_FILE_PATTERNS = [/\.min\.(js|css)$/, /\.map$/];

const LANG_MAP = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sql': 'sql',
};

// ── Helpers ───────────────────────────────────────────────────────────────

const skippedLarge = [];

function getLang(filePath) {
  return LANG_MAP[path.extname(filePath).toLowerCase()] || '';
}

function isIgnoredDir(name) {
  return (
    IGNORE_DIRS.has(name) ||
    IGNORE_DIR_PREFIXES.some((p) => name.startsWith(p))
  );
}

function isCodeFile(name) {
  if (IGNORE_FILES.has(name)) return false;
  if (IGNORE_FILE_PATTERNS.some((re) => re.test(name))) return false;
  if (CODE_EXTENSIONS.has(path.extname(name).toLowerCase())) return true;
  return withConfig && CONFIG_FILE_PATTERNS.some((re) => re.test(name));
}

/**
 * Build a pruned tree: { dirs: [{ name, node }], files: [name] }.
 * Directories that contain no code files are dropped.
 */
function buildNode(dir) {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  const dirs = [];
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (isIgnoredDir(entry.name)) continue;
      const node = buildNode(path.join(dir, entry.name));
      if (node.dirs.length > 0 || node.files.length > 0) {
        dirs.push({ name: entry.name, node });
      }
    } else if (isCodeFile(entry.name)) {
      const full = path.join(dir, entry.name);
      let size = 0;
      try {
        size = fs.statSync(full).size;
      } catch {
        continue;
      }
      if (size > MAX_FILE_BYTES) {
        skippedLarge.push(path.relative(rootPath, full));
        continue;
      }
      files.push(entry.name);
    }
  }
  return { dirs, files };
}

function renderTree(node, prefix = '') {
  let out = '';
  const items = [
    ...node.dirs.map((d) => ({ name: d.name, node: d.node, isDir: true })),
    ...node.files.map((f) => ({ name: f, isDir: false })),
  ];
  items.forEach((item, i) => {
    const last = i === items.length - 1;
    out += `${prefix}${last ? '└── ' : '├── '}${item.name}${item.isDir ? '/' : ''}\n`;
    if (item.isDir) {
      out += renderTree(item.node, prefix + (last ? '    ' : '│   '));
    }
  });
  return out;
}

/** File paths (relative to root) in the same order as the tree. */
function listFiles(node, relBase = '') {
  let result = node.files.map((f) => path.join(relBase, f));
  for (const d of node.dirs) {
    result = result.concat(listFiles(d.node, path.join(relBase, d.name)));
  }
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(rootPath)) {
    console.error(`Path does not exist: ${rootPath}`);
    process.exit(1);
  }

  const projectName = path.basename(rootPath);
  const tree = buildNode(rootPath);
  const allFiles = listFiles(tree);

  let md = `# Project Snapshot: ${projectName}\n\n`;
  md += `Generated: ${new Date().toISOString()}\n\n`;
  md += `Root: \`${rootPath}\`\n\n`;
  md += `Only source-code files are included${withConfig ? ' (plus config files)' : ''}.\n\n`;

  md += `## Folder Structure\n\n`;
  md += '```\n';
  md += `${projectName}/\n`;
  md += renderTree(tree);
  md += '```\n\n';

  md += `## File Contents\n\n`;

  for (const relFile of allFiles) {
    const displayPath = relFile.split(path.sep).join('/');
    md += `### \`${displayPath}\`\n\n`;

    let content;
    try {
      content = fs.readFileSync(path.join(rootPath, relFile), 'utf8');
    } catch (err) {
      md += `_Could not read file: ${err.message}_\n\n`;
      continue;
    }

    md += '```' + getLang(relFile) + '\n';
    md += content;
    if (!content.endsWith('\n')) md += '\n';
    md += '```\n\n';
  }

  fs.writeFileSync(outputFile, md, 'utf8');
  console.log(`Snapshot written to: ${outputFile}`);
  console.log(`  Code files included: ${allFiles.length}`);
  if (skippedLarge.length > 0) {
    console.log(`  Skipped (over ${MAX_FILE_BYTES / 1024} KB):`);
    skippedLarge.forEach((f) => console.log(`    - ${f}`));
  }
}

main();
