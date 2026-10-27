#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve("frontend");
const failures = [];
const references = [];
const jsFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.m?js$/i.test(entry.name)) jsFiles.push(full);
  }
}

function namedBindings(clause) {
  const braces = clause.match(/\{([\s\S]*?)\}/);
  if (!braces) return [];
  return braces[1].split(",").map((part) => {
    const binding = part.trim().split(/\s+as\s+/)[0].trim();
    return binding && binding !== "type" ? binding : "";
  }).filter(Boolean);
}

function addReference(from, specifier, names = []) {
  if (!specifier.startsWith(".")) return;
  let targetUrl;
  try { targetUrl = new URL(specifier, pathToFileURL(from)); }
  catch { failures.push(`${path.relative(root, from)}: invalid module URL ${specifier}`); return; }
  const target = path.resolve(fileURLToPath(targetUrl));
  if (!target.startsWith(root + path.sep)) {
    failures.push(`${path.relative(root, from)}: relative import escapes frontend: ${specifier}`);
    return;
  }
  const version = targetUrl.searchParams.get("v") ?? "<missing>";
  references.push({ from, specifier, target, version, names });
  if (!fs.existsSync(target)) failures.push(`${path.relative(root, from)}: missing module ${specifier}`);
}

walk(root);

for (const file of jsFiles) {
  const source = fs.readFileSync(file, "utf8");
  const consumed = new Set();

  // Static imports, including side-effect imports.
  const staticImport = /\bimport\s+(?!\s*\()([\s\S]*?)\s+from\s+(["'])([^"']+)\2\s*;?/g;
  for (const match of source.matchAll(staticImport)) {
    for (let i = match.index; i < match.index + match[0].length; i++) consumed.add(i);
    addReference(file, match[3], namedBindings(match[1]));
  }
  const sideEffectImport = /\bimport\s+(["'])([^"']+)\1\s*;?/g;
  for (const match of source.matchAll(sideEffectImport)) {
    if (consumed.has(match.index)) continue;
    addReference(file, match[2]);
  }

  // Literal dynamic imports. Also validate destructured named bindings.
  const dynamicImport = /\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g;
  for (const match of source.matchAll(dynamicImport)) {
    const before = source.slice(Math.max(0, match.index - 220), match.index);
    const destructure = before.match(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:await\s*)?$/);
    addReference(file, match[2], destructure ? namedBindings(`{${destructure[1]}}`) : []);
  }
}

// HTML script entry points participate in the same version consistency check.
const htmlFiles = [];
function walkHtml(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full);
    else if (/\.html?$/i.test(entry.name)) htmlFiles.push(full);
  }
}
walkHtml(root);
for (const file of htmlFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+\.m?js(?:\?[^"']*)?)\1/gi)) {
    addReference(file, match[2]);
  }
}

const exportsCache = new Map();
function moduleExports(file, stack = new Set()) {
  if (exportsCache.has(file)) return exportsCache.get(file);
  if (stack.has(file) || !fs.existsSync(file)) return new Set();
  const nextStack = new Set(stack).add(file);
  const source = fs.readFileSync(file, "utf8");
  const names = new Set();
  for (const match of source.matchAll(/^\s*export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([\w$]+)/gm)) names.add(match[1]);
  for (const match of source.matchAll(/^\s*export\s*\{([^}]*)\}(?:\s*from\s*(["'])([^"']+)\2)?\s*;?/gm)) {
    const reexport = match[3] ? resolveLocal(file, match[3]) : null;
    for (const item of match[1].split(",")) {
      const parts = item.trim().split(/\s+as\s+/);
      const exported = (parts[1] || parts[0]).trim();
      if (exported) names.add(exported);
    }
    if (reexport) for (const name of moduleExports(reexport, nextStack)) names.add(name);
  }
  for (const match of source.matchAll(/^\s*export\s+\*\s+from\s*(["'])([^"']+)\1/gm)) {
    const reexport = resolveLocal(file, match[2]);
    if (reexport) for (const name of moduleExports(reexport, nextStack)) names.add(name);
  }
  exportsCache.set(file, names);
  return names;
}

function resolveLocal(from, specifier) {
  if (!specifier.startsWith(".")) return null;
  return path.resolve(path.dirname(from), decodeURIComponent(specifier.split(/[?#]/, 1)[0]));
}

for (const reference of references) {
  if (!reference.names.length || !fs.existsSync(reference.target)) continue;
  const available = moduleExports(reference.target);
  for (const name of reference.names) {
    if (!available.has(name)) {
      failures.push(`${path.relative(root, reference.from)} imports missing export ${name} from ${reference.specifier}`);
    }
  }
}

const byTarget = new Map();
for (const reference of references) {
  const group = byTarget.get(reference.target) || [];
  group.push(reference);
  byTarget.set(reference.target, group);
}
for (const [target, group] of byTarget) {
  const versions = [...new Set(group.map((reference) => reference.version))];
  if (versions.length > 1) {
    const details = group.map(({ from, version }) => `  ${path.relative(root, from)}: ${version}`).join("\n");
    failures.push(`inconsistent versions for ${path.relative(root, target)} (${versions.join(", ")}):\n${details}`);
  }
}

if (failures.length) {
  console.error(`Import audit failed (${failures.length} issue${failures.length === 1 ? "" : "s"}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Import audit passed: ${references.length} relative module references checked across ${jsFiles.length} JavaScript files and ${htmlFiles.length} HTML files.`);
}
