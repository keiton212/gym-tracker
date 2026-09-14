#!/bin/bash
# Run only on the ephemeral GitHub macOS runner. Never enable shell tracing.
set -euo pipefail
umask 077

python3 - <<'PY'
import base64, os, pathlib
root = pathlib.Path(os.environ['RUNNER_TEMP'])
for env, name in [('APPLE_CERTIFICATE_BASE64', 'gymtracker-signing.p12'),
                  ('APPLE_PROVISIONING_PROFILE_BASE64', 'gymtracker-profile.mobileprovision')]:
    root.joinpath(name).write_bytes(base64.b64decode(os.environ[env], validate=True))
PY
security cms -D -i "$RUNNER_TEMP/gymtracker-profile.mobileprovision" > "$RUNNER_TEMP/gymtracker-profile.plist"
python3 - <<'PY'
import datetime, os, pathlib, plistlib
root = pathlib.Path(os.environ['RUNNER_TEMP'])
p = plistlib.loads(root.joinpath('gymtracker-profile.plist').read_bytes())
team = os.environ['APPLE_TEAM_ID']
ent = p['Entitlements']
bundle = 'com.keiton212.gymtracker'
assert team in p['TeamIdentifier'], 'Profile team mismatch'
assert ent['application-identifier'].split('.', 1)[1] == bundle, 'Profile bundle ID mismatch'
assert p['ExpirationDate'] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None), 'Profile expired'
assert p.get('ProvisionedDevices'), 'A registered-device Development or Ad Hoc profile is required'
method = 'debugging' if ent.get('get-task-allow') else 'release-testing'
options = dict(method=method, teamID=team, signingStyle='manual',
               provisioningProfiles={bundle: p['UUID']}, manageAppVersionAndBuildNumber=False)
root.joinpath('gymtracker-export-options.plist').write_bytes(plistlib.dumps(options))
PY

KEYCHAIN="$RUNNER_TEMP/gymtracker-signing.keychain-db"
KEYCHAIN_PASSWORD="$(openssl rand -hex 32)"
echo "::add-mask::$KEYCHAIN_PASSWORD"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security import "$RUNNER_TEMP/gymtracker-signing.p12" -P "$APPLE_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN" >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null
security list-keychains -d user -s "$KEYCHAIN"
mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
cp "$RUNNER_TEMP/gymtracker-profile.mobileprovision" "$HOME/Library/MobileDevice/Provisioning Profiles/gymtracker-ci.mobileprovision"

# Match an imported private-key identity to a certificate in the profile.
export SIGNING_IDENTITY="$(python3 - <<'PY'
import hashlib, os, pathlib, plistlib, subprocess
root = pathlib.Path(os.environ['RUNNER_TEMP'])
p = plistlib.loads(root.joinpath('gymtracker-profile.plist').read_bytes())
identities = subprocess.check_output(['security', 'find-identity', '-v', '-p', 'codesigning', str(root/'gymtracker-signing.keychain-db')], text=True)
for cert in p['DeveloperCertificates']:
    digest = hashlib.sha1(cert).hexdigest().upper()
    if digest in identities:
        print(digest)
        break
else:
    raise SystemExit('No private-key signing identity matches the provisioning profile')
PY
)"
test -n "$SIGNING_IDENTITY"
export PROFILE_UUID="$(/usr/libexec/PlistBuddy -c 'Print UUID' "$RUNNER_TEMP/gymtracker-profile.plist")"

# Only change App settings in the disposable checkout; leave CocoaPods targets alone.
ruby - <<'RUBY'
require 'xcodeproj'
project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
app = project.targets.find { |target| target.name == 'App' }
abort 'App target not found' unless app
app.build_configurations.each do |config|
  config.build_settings['CODE_SIGN_STYLE'] = 'Manual'
  config.build_settings['DEVELOPMENT_TEAM'] = ENV.fetch('APPLE_TEAM_ID')
  config.build_settings['CODE_SIGN_IDENTITY'] = ENV.fetch('SIGNING_IDENTITY')
  config.build_settings['PROVISIONING_PROFILE_SPECIFIER'] = ENV.fetch('PROFILE_UUID')
end
project.save
RUBY

xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' \
  -archivePath "$RUNNER_TEMP/GymTracker.xcarchive" archive
xcodebuild -exportArchive -archivePath "$RUNNER_TEMP/GymTracker.xcarchive" \
  -exportOptionsPlist "$RUNNER_TEMP/gymtracker-export-options.plist" \
  -exportPath "$RUNNER_TEMP/gymtracker-export"

python3 - <<'PY'
import os, pathlib, plistlib, zipfile
root = pathlib.Path(os.environ['RUNNER_TEMP'])
ipas = list(root.joinpath('gymtracker-export').glob('*.ipa'))
assert len(ipas) == 1, 'Expected exactly one IPA'
with zipfile.ZipFile(ipas[0]) as z:
    info = [n for n in z.namelist() if n.startswith('Payload/') and n.count('/') == 2 and n.endswith('/Info.plist')]
    assert len(info) == 1, 'Expected one app in IPA'
    p = plistlib.loads(z.read(info[0]))
    assert p['CFBundleIdentifier'] == 'com.keiton212.gymtracker'
    assert p.get('NSMicrophoneUsageDescription'), 'Missing microphone usage description'
    assert 'audio' in p.get('UIBackgroundModes', []), 'Missing background audio mode'
    assert info[0].replace('Info.plist', 'embedded.mobileprovision') in z.namelist()
print('Device IPA exported; physical-device recording remains unverified.')
PY
