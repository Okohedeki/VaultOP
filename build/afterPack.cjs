// Ad-hoc code-sign the macOS app after packaging.
//
// Without a paid Apple Developer ID we can't notarize, but an UNSIGNED arm64 app
// is rejected by macOS as "damaged and can't be opened" — a dead end. Ad-hoc
// signing (`codesign -s -`) produces a valid signature so the app instead hits the
// normal Gatekeeper path: users can open it via System Settings → Privacy &
// Security → "Open Anyway", or by removing the download quarantine
// (`xattr -cr /Applications/VaultOP.app`). Signs nested binaries too
// (better-sqlite3, ffmpeg) via --deep.

const { execSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  // eslint-disable-next-line no-console
  console.log(`  • ad-hoc signing ${appPath}`)
  execSync(`codesign --deep --force --sign - "${appPath}"`, { stdio: 'inherit' })
  // Sanity check the signature is valid.
  execSync(`codesign --verify --verbose=1 "${appPath}"`, { stdio: 'inherit' })
}
