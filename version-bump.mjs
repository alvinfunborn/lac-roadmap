// Sync manifest.json + versions.json with the version `npm version` just
// wrote into package.json. Hooked into the `version` lifecycle script so
// `npm version patch|minor|major` produces ONE commit containing all three
// files in lockstep — preventing the "manifest says 1.3.4 but versions.json
// still ends at 1.3.3" drift that BRAT's minAppVersion lookup falls over on.
//
// Run automatically by `npm version`; not meant to be invoked directly.

import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  console.error("npm_package_version not set — run via `npm version`, not directly.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");

console.log(`Bumped to ${targetVersion} (minAppVersion ${minAppVersion}).`);
