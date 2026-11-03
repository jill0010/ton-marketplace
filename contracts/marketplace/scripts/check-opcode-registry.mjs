import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const registryPath = path.resolve(root, "../../docs/architecture/TON_MARKETPLACE_OPCODE_REGISTRY_2026-11-03.md");
const ignoredDirectories = new Set([".acton", "build", "node_modules", "dist"]);

async function collectTolkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...await collectTolkFiles(path.join(directory, entry.name)));
      }
    } else if (entry.isFile() && entry.name.endsWith(".tolk")) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

const files = await collectTolkFiles(root);
const declarations = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  const pattern = /\bstruct\s*\(\s*(0x[0-9a-fA-F]+)\s*\)\s*([A-Za-z_]\w*)/g;
  for (const match of source.matchAll(pattern)) {
    declarations.push({
      opcode: match[1].toLowerCase(),
      name: match[2],
      file: path.relative(root, file).replaceAll(path.sep, "/"),
    });
  }
}

const duplicates = new Map();
for (const declaration of declarations) {
  const entries = duplicates.get(declaration.opcode) ?? [];
  entries.push(declaration);
  duplicates.set(declaration.opcode, entries);
}
const collisions = [...duplicates.entries()].filter(([, entries]) => entries.length > 1);
if (collisions.length > 0) {
  for (const [opcode, entries] of collisions) {
    console.error(`Duplicate opcode ${opcode}:`);
    for (const entry of entries) console.error(`  ${entry.name} — ${entry.file}`);
  }
  process.exitCode = 1;
}

const registry = await readFile(registryPath, "utf8");
const registered = new Map();
for (const match of registry.matchAll(/\|\s*`(0x[0-9a-fA-F]+)`\s*\|\s*`([A-Za-z_]\w*)`\s*\|/g)) {
  registered.set(match[1].toLowerCase(), match[2]);
}
const missing = declarations.filter((item) => registered.get(item.opcode) !== item.name);
if (missing.length > 0) {
  console.error("Opcode registry is missing or mismatches these Tolk declarations:");
  for (const item of missing) {
    console.error(`  ${item.opcode} ${item.name} — ${item.file}; registry has ${registered.get(item.opcode) ?? "no entry"}`);
  }
  process.exitCode = 1;
}

const unused = [...registered.entries()].filter(([opcode, name]) =>
  !declarations.some((item) => item.opcode === opcode && item.name === name),
);
if (unused.length > 0) {
  console.error("Registry entries without a matching Tolk declaration (reserved entries are allowed):");
  for (const [opcode, name] of unused) console.error(`  ${opcode} ${name}`);
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log(`Opcode registry check passed: ${declarations.length} Tolk declarations, no collisions, all implemented opcodes registered.`);
