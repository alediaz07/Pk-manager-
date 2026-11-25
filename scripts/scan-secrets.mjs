#!/usr/bin/env node
/**
 * Pollos Karen Manager — Secret & Bundle Leak Scanner
 * Scans source files and (optionally) compiled dist/ bundle for accidentally leaked private secrets.
 * Usage:
 *   node scripts/scan-secrets.mjs          # scan source files
 *   node scripts/scan-secrets.mjs --dist   # also scan compiled dist/ bundle
 */

import fs from 'fs';
import path from 'path';

const includeDist = process.argv.includes('--dist');
const rootDir = process.cwd();

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'coverage',
  '.firebase',
  'public/assets/aistudio',
  'dist/assets/aistudio',
]);

if (!includeDist) {
  IGNORE_DIRS.add('dist');
}

const IGNORE_FILES = new Set([
  'bun.lock',
  'package-lock.json',
  'yarn.lock',
  'firebase-applet-config.json', // Public Firebase web app config (apiKey is intentionally public identifier)
  'scan-secrets.mjs',
]);

// High-confidence secret patterns that MUST NEVER appear in source or compiled bundles
const SECRET_PATTERNS = [
  { name: 'Private Key Block', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: 'Google Service Account JSON', regex: /"type"\s*:\s*"service_account"/g },
  { name: 'OpenAI / Anthropic Secret Key', regex: /\bsk-(?:proj-|ant-)?[a-zA-Z0-9_-]{24,}\b/g },
  { name: 'GitHub Personal Access Token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,}\b/g },
  { name: 'GitHub Fine-Grained PAT', regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: 'AWS Access Key ID', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Hardcoded GEMINI_API_KEY value', regex: /GEMINI_API_KEY\s*[:=]\s*["']AIza[0-9A-Za-z_-]{35}["']/g },
  { name: 'Hardcoded JARVIS_API_KEY literal fallback', regex: /JARVIS_API_KEY\s*\|\|\s*["'][^"']{6,}["']/g },
  { name: 'Client-exposed VITE secret name', regex: /\bVITE_(?:GEMINI|JARVIS|ADMIN|SECRET|PRIVATE)[A-Z0-9_]*\b/g },
];

// Additional patterns strictly forbidden inside compiled frontend bundle (dist/)
const BUNDLE_FORBIDDEN_PATTERNS = [
  { name: 'JARVIS_API_KEY reference in client bundle', regex: /\bJARVIS_API_KEY\b/g },
  { name: 'GEMINI_API_KEY reference in client bundle', regex: /\bGEMINI_API_KEY\b/g },
  { name: 'cachedAdminToken in client bundle', regex: /\bcachedAdminToken\b/g },
];

const findings = [];

function shouldSkipDir(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  if (IGNORE_DIRS.has(normalized)) return true;
  const base = path.basename(normalized);
  return IGNORE_DIRS.has(base);
}

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (!shouldSkipDir(relPath)) {
        walk(fullPath);
      }
      continue;
    }

    if (IGNORE_FILES.has(entry.name)) continue;
    if (/\.(png|jpg|jpeg|webp|ico|woff|woff2|pdf|zip|mp3|wav)$/i.test(entry.name)) continue;

    // Detect forbidden files by filename
    if (/^\.env($|\.(?!example$))/.test(entry.name)) {
      findings.push({ file: relPath, pattern: 'Forbidden local .env file present in scan tree', line: 1 });
      continue;
    }
    if (/(service[-_]?account|firebase-adminsdk).+\.json$/i.test(entry.name)) {
      findings.push({ file: relPath, pattern: 'Forbidden service account JSON file', line: 1 });
      continue;
    }

    let content;
    try {
      const stat = fs.statSync(fullPath);
      if (stat.size > 10 * 1024 * 1024) continue;
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const patternsToRun = relPath.startsWith('dist/')
      ? [...SECRET_PATTERNS, ...BUNDLE_FORBIDDEN_PATTERNS]
      : SECRET_PATTERNS;

    for (const pat of patternsToRun) {
      pat.regex.lastIndex = 0;
      let match;
      while ((match = pat.regex.exec(content)) !== null) {
        const lineNum = content.slice(0, match.index).split('\n').length;
        findings.push({
          file: relPath,
          pattern: pat.name,
          line: lineNum,
        });
      }
    }
  }
}

walk(rootDir);

if (findings.length > 0) {
  console.error(`\n[SECRET SCAN FAILED] Se encontraron ${findings.length} posibles exposiciones:`);
  for (const f of findings) {
    console.error(`  - ${f.file}:${f.line} -> ${f.pattern}`);
  }
  console.error('\nNUNCA imprima ni suba valores reales de secretos. Corrija antes de continuar.\n');
  process.exit(1);
} else {
  console.log(`[SECRET SCAN OK] Cero secretos privados expuestos (${includeDist ? 'código fuente + dist/' : 'código fuente'}).`);
}
