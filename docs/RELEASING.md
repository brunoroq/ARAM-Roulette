# Releasing

The tag-triggered [Windows workflow](../.github/workflows/release.yml) uses the
[official Tauri action](https://v2.tauri.app/distribute/pipelines/github/) to test,
type-check and build a Windows x64 NSIS installer, then publish it to GitHub Releases.
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

Watch the **Windows release** run in GitHub Actions. On success, the installer
appears on release **v0.1.0**. On failure, inspect the logs and rerun the failed
job after resolving the cause. Do not move an already published version tag;
use a new version for changes. Tags must match the versions in `package.json`,
`package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
`src-tauri/Cargo.lock`; the release check rejects mismatches.

