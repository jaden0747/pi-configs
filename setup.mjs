#!/usr/bin/env node

import { copyFile, cp, lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const unknown = [...args].filter((arg) => !["--link", "--dry-run", "--help", "-h"].includes(arg));
if (unknown.length > 0) {
  console.error(`Unknown option: ${unknown.join(", ")}`);
  process.exit(1);
}
if (args.has("--help") || args.has("-h")) {
  console.log(`Install the curated Pi theme, footer, model defaults, and skills.

Usage: node setup.mjs [--link] [--dry-run]

  --link     Symlink files instead of copying them
  --dry-run  Print changes without writing anything

PI_CODING_AGENT_DIR overrides the default ~/.pi/agent destination.`);
  process.exit(0);
}

const link = args.has("--link");
const dryRun = args.has("--dry-run");
const root = dirname(fileURLToPath(import.meta.url));
const configDir = resolve(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"));
const files = [
  [join(root, "themes", "vscode-dark-modern.json"), join(configDir, "themes", "vscode-dark-modern.json")],
  [join(root, "extensions", "vscode-powerline.ts"), join(configDir, "extensions", "vscode-powerline.ts")],
];
const skillNames = ["caveman", "grill-me", "grill-with-docs", "handoff", "review", "zoom-out"];
const packageNames = [
  "npm:pi-subagents",
  "npm:@juicesharp/rpiv-ask-user-question",
  "npm:@juicesharp/rpiv-todo",
];
// Packages previously managed by this repository. They are pruned during setup
// so syncing the repository also removes them from another machine.
const retiredPackageNames = ["npm:pi-web-access", "npm:pi-ponytail"];
const run = promisify(execFile);
const directories = skillNames.map((name) => [
  join(root, "skills", name),
  join(configDir, "skills", name),
]);

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function installFile(source, destination) {
  console.log(`${link ? "link" : "copy"}    ${source} -> ${destination}`);
  if (dryRun) return;
  await mkdir(dirname(destination), { recursive: true });
  await rm(destination, { recursive: true, force: true });
  if (link) {
    try {
      await symlink(source, destination, "file");
    } catch (error) {
      if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error?.code)) {
        throw new Error("Windows denied symlink creation. Enable Developer Mode, run as Administrator, or install without --link.");
      }
      throw error;
    }
  } else {
    await copyFile(source, destination);
  }
}

async function installDirectory(source, destination) {
  console.log(`${link ? "link" : "copy"}    ${source} -> ${destination}`);
  if (dryRun) return;
  await mkdir(dirname(destination), { recursive: true });
  await rm(destination, { recursive: true, force: true });
  if (link) {
    try {
      await symlink(source, destination, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error?.code)) {
        throw new Error("Windows denied symlink creation. Enable Developer Mode, run as Administrator, or install without --link.");
      }
      throw error;
    }
  } else {
    await cp(source, destination, { recursive: true });
  }
}

async function updateSettings() {
  const settingsPath = join(configDir, "settings.json");
  const desiredSettings = {
    theme: "vscode-dark-modern",
    defaultProvider: "openai-codex",
    defaultModel: "gpt-5.6-luna",
  };
  let settings = {};
  if (await exists(settingsPath)) {
    try {
      settings = JSON.parse(await readFile(settingsPath, "utf8"));
    } catch (error) {
      throw new Error(`Cannot parse ${settingsPath}: ${error.message}`);
    }
  }
  const existingPackages = Array.isArray(settings.packages) ? settings.packages : [];
  const packages = [...new Set([
    ...existingPackages.filter((name) => !retiredPackageNames.includes(name)),
    ...packageNames,
  ])];
  const retired = existingPackages.filter((name) => retiredPackageNames.includes(name));
  for (const packageName of retired) {
    console.log(`remove   ${packageName}`);
    if (!dryRun) {
      try {
        await run("pi", ["remove", packageName], { cwd: root });
      } catch (error) {
        throw new Error(`Cannot remove ${packageName}: ${error.stderr?.trim() || error.message}`);
      }
    }
  }
  const changes = Object.entries(desiredSettings).filter(([key, value]) => settings[key] !== value);
  if (JSON.stringify(settings.packages) !== JSON.stringify(packages)) changes.push(["packages", packages]);
  if (changes.length === 0) {
    console.log(`keep     ${settingsPath} (theme, model defaults, and packages already selected)`);
    return;
  }
  console.log(`update   ${settingsPath} (${changes.map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join(", ")})`);
  if (dryRun) return;
  await mkdir(configDir, { recursive: true });
  Object.assign(settings, desiredSettings, { packages });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

try {
  for (const [source, destination] of files) await installFile(source, destination);
  for (const [source, destination] of directories) await installDirectory(source, destination);
  await updateSettings();
  console.log(`\nInstalled in ${configDir}. Run /reload in Pi, or restart Pi.`);
} catch (error) {
  console.error(`\nSetup failed: ${error.message}`);
  process.exit(1);
}
