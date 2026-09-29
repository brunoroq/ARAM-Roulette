# Releasing

The tag-triggered [Windows workflow](../.github/workflows/release.yml) uses the
[official Tauri action](https://v2.tauri.app/distribute/pipelines/github/) to test,
type-check and build a Windows x64 NSIS installer, then publish it to GitHub Releases.
A second Windows job builds and verifies the portable ZIP and uploads it to the
same release, checking the installer's release ID and both final asset names.
Only Windows is configured. No signing keys, API keys or updater are required.
The workflow uses GitHub's automatic token with `contents: write`; repository or
organization policy must allow Actions to run and create releases.

Ensure `origin` points to your GitHub repository and Git is authenticated for
pushes. For public downloads, the repository/releases must be publicly accessible.
For the first commit/release, from the repository root:

```sh
git add .
git commit -m "Prepare ARAM Roulette v0.1.0 Windows release"
git push -u origin main
git tag -a v0.1.0 -m "ARAM Roulette v0.1.0"
git push origin v0.1.0
```

Watch both jobs in **Windows release** in GitHub Actions. On success, release
**v0.1.0** contains:

- `ARAM-Roulette-v0.1.0-Windows-Setup.exe`
- `ARAM-Roulette-v0.1.0-Windows-Portable.zip`

The `windows` job retains the original NSIS build command and default application
directories. The `portable` job runs on a fresh runner after the installer release
exists; its separate configuration and Cargo target directory cannot affect NSIS.
It builds with `--no-bundle`, packages an explicit file list, and checks the
extracted ZIP before uploading. The blocking checks require the built Windows x64
EXE and ZIP; verify that extraction succeeds; compare every extracted file byte
for byte with the built executable and required resources; reject all extra files,
including development files; and confirm the portable configuration uses embedded
frontend assets, executable-relative `./app-data`, and system WebView2. The
frontend build check verifies copied images/fonts before the executable is built.
CI does not require WebView2 to render the app. See [Development](DEVELOPMENT.md)
for local commands.

The installer is published first. If portable verification fails, the installer
remains available and the ZIP is not uploaded; rerun the failed portable job after
diagnosing the failure. Uploads use the same version tag and release ID; retries
replace the same ZIP asset rather than creating a second release.

On failure, inspect the logs and rerun the failed
job after resolving the cause. Do not move an already published version tag;
use a new version for changes. Tags must match the versions in `package.json`,
`package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
`src-tauri/Cargo.lock`; the release check rejects mismatches.

Before tagging, run `npm test`, `npm run build`, and `npm run check:release`.
The portable packaging tests reject non-x64 executables, unintended source/build
files, unsafe resource paths, and accidental portable settings in the NSIS config.
For a manual final check on a normal Windows 10/11 machine with Microsoft WebView2
Runtime installed, extract the ZIP in a writable folder and launch `ARAM Roulette.exe`
without Node.js/npm/Rust/Tauri CLI. Verify the UI and artwork render, complete a
draft, close and reopen the app to check language persistence, and confirm
`app-data` appears beside the executable. Check the installer separately for its
Start-menu entry and normal Windows app-data location. NSIS still bootstraps
WebView2 if missing.
