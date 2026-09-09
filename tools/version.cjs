// tools/version.cjs — one version number, four places (v1.14).
//
//   node tools/version.cjs          rewrite everything from package.json
//   node tools/version.cjs --check  fail if anything disagrees (used by tests)
//
// package.json "version" is the source of truth. Everything else is derived:
//
//   index.html <title>                    Stack'd v<major>.<minor>
//   android versionName                   <major>.<minor>.<patch>
//   android versionCode                   major*10000 + minor*100 + patch
//   iOS MARKETING_VERSION                 <major>.<minor>.<patch>
//   iOS CURRENT_PROJECT_VERSION           same integer as versionCode
//
// Both stores need a strictly increasing build integer per upload, so a
// rejected or replaced build is re-uploaded under a bumped PATCH — never the
// same number twice.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(ROOT, p), s);

function versions() {
  const pkg = JSON.parse(read('package.json'));
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version || '');
  if (!m) throw new Error(`package.json version must be MAJOR.MINOR.PATCH, got ${pkg.version}`);
  const [major, minor, patch] = m.slice(1).map(Number);
  return {
    name: `${major}.${minor}.${patch}`,
    title: `Stack'd v${major}.${minor}`,
    code: major * 10000 + minor * 100 + patch
  };
}

// [file, regex, replacement] — every regex must match exactly `count` times.
function targets(v) {
  return [
    ['index.html', /<title>[^<]*<\/title>/g, `<title>${v.title}</title>`, 1],
    ['android/app/build.gradle', /versionCode \d+/g, `versionCode ${v.code}`, 1],
    ['android/app/build.gradle', /versionName "[^"]*"/g, `versionName "${v.name}"`, 1],
    ['ios/App/App.xcodeproj/project.pbxproj', /MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${v.name};`, 2],
    ['ios/App/App.xcodeproj/project.pbxproj', /CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${v.code};`, 2]
  ];
}

function run(check) {
  const v = versions();
  const problems = [];
  const files = new Map();
  for (const [file, re, replacement, count] of targets(v)) {
    const before = files.has(file) ? files.get(file) : read(file);
    const found = before.match(re) || [];
    if (found.length !== count) {
      problems.push(`${file}: expected ${count} match(es) of ${re}, found ${found.length}`);
      continue;
    }
    const after = before.replace(re, replacement);
    if (after !== before) problems.push(`${file}: ${found.join(', ')} -> ${replacement}`);
    files.set(file, after);
  }
  if (check) return problems;
  for (const [file, contents] of files) write(file, contents);
  return problems;
}

module.exports = { versions, run };

if (require.main === module) {
  const check = process.argv.includes('--check');
  const problems = run(check);
  if (!problems.length) {
    console.log(`versions agree: ${versions().name} (build ${versions().code})`);
    process.exit(0);
  }
  console[check ? 'error' : 'log'](problems.join('\n'));
  if (check) {
    console.error('\nRun `npm run version:sync` to fix.');
    process.exit(1);
  }
  console.log('\nupdated.');
}
