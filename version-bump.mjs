import fs from 'node:fs';
const {version} = JSON.parse(fs.readFileSync('package.json','utf8'));
const manifest = JSON.parse(fs.readFileSync('manifest.json','utf8'));
manifest.version = version;
fs.writeFileSync('manifest.json',JSON.stringify(manifest,null,2)+'\n');
const versions = JSON.parse(fs.readFileSync('versions.json','utf8'));
versions[version] = manifest.minAppVersion;
fs.writeFileSync('versions.json',JSON.stringify(versions,null,2)+'\n');
