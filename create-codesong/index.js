#!/usr/bin/env node
/**
 * create-codesong — scaffolds a new Codesong project and installs it.
 *   npx create-codesong@latest my-song
 *
 * Zero dependencies: copies the bundled template, sets the project name, runs
 * `npm install`, then copies the authoring guide out of the installed codesong package.
 */
import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const templateDir = join(here, "template");

function main() {
  const arg = process.argv[2];
  const targetName = arg ?? "codesong-song";
  const target = resolve(process.cwd(), targetName);

  if (existsSync(target) && readdirSync(target).length > 0) {
    console.error(`✗ Directory "${targetName}" already exists and is not empty.`);
    process.exit(1);
  }
  mkdirSync(target, { recursive: true });

  console.log(`Creating Codesong project in ${target} …`);
  cpSync(templateDir, target, { recursive: true });

  // Set the project name from the target directory.
  const pkgPath = join(target, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.name = basename(target).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  // npm renames dotfiles in published packages; restore .gitignore if shipped as _gitignore.
  const gi = join(target, "_gitignore");
  if (existsSync(gi)) cpSync(gi, join(target, ".gitignore"));

  console.log("Installing dependencies (this may take a minute) …");
  try {
    // shell:true so the Windows `npm.cmd` shim resolves via PATHEXT.
    execFileSync("npm", ["install"], { cwd: target, stdio: "inherit", shell: true });
  } catch {
    console.warn("⚠ npm install failed — run `npm install` yourself in the project directory.");
  }

  // Copy the authoring guide out of the installed package so it's right there.
  const guide = join(target, "node_modules", "codesong", "CODESONG.md");
  if (existsSync(guide)) cpSync(guide, join(target, "CODESONG.md"));

  console.log(`
✓ Done!

  cd ${targetName}
  npm run render      # song.tsx -> out.wav (+ analysis report)
  npm run mp3         # song.tsx -> out.mp3

Edit song.tsx and re-render. See CODESONG.md for the full authoring API.
`);
}

main();
