// Notarize + staple the signed macOS app (electron-builder afterSign hook).
//
// Auth, in priority order (so the same hook works locally and in CI):
//   1. NOTARY_PROFILE         → a `xcrun notarytool store-credentials` keychain profile
//   2. APPLE_API_KEY + _ID + _ISSUER → App Store Connect API key (.p8)
//   3. APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID → Apple ID creds
// If none are present (or SKIP_NOTARIZE=1), the app is left signed-but-not-notarized
// and the build continues — handy for quick local test builds.

const { execSync } = require('node:child_process')
const path = require('node:path')

function authArgs() {
  if (process.env.NOTARY_PROFILE) return `--keychain-profile "${process.env.NOTARY_PROFILE}"`
  if (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER) {
    return `--key "${process.env.APPLE_API_KEY}" --key-id "${process.env.APPLE_API_KEY_ID}" --issuer "${process.env.APPLE_API_ISSUER}"`
  }
  if (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) {
    return `--apple-id "${process.env.APPLE_ID}" --password "${process.env.APPLE_APP_SPECIFIC_PASSWORD}" --team-id "${process.env.APPLE_TEAM_ID}"`
  }
  return null
}

exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.SKIP_NOTARIZE === '1') {
    console.log('  • notarize: skipped (SKIP_NOTARIZE=1)')
    return
  }
  const auth = authArgs()
  if (!auth) {
    console.log('  • notarize: skipped (no NOTARY_PROFILE / APPLE_* credentials set)')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  const zipPath = path.join(context.appOutDir, `${appName}-notarize.zip`)

  console.log(`  • notarize: submitting ${appName}.app …`)
  execSync(`ditto -c -k --keepParent "${appPath}" "${zipPath}"`, { stdio: 'inherit' })
  execSync(`xcrun notarytool submit "${zipPath}" ${auth} --wait`, { stdio: 'inherit' })
  execSync(`xcrun stapler staple "${appPath}"`, { stdio: 'inherit' })
  execSync(`rm -f "${zipPath}"`)
  console.log('  • notarize: stapled ✓')
}
