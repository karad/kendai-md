# Publishing to npm

1. Confirm that you can publish the `kendai-md` name on npm. An unscoped name must be available or owned by your account; GitHub ownership does not reserve it.
2. Sign in with `npm login` and confirm the account with `npm whoami`. Interactive publishing requires two-factor authentication; make sure you can complete the verification prompt.
3. For later releases, update the version in `package.json` and `package-lock.json` (for example, `npm version patch`). npm does not allow reusing a published version.
4. Run `npm publish --dry-run` to run the release checks and inspect the package contents without uploading. A successful dry run validates the local package; it does not confirm package-name availability, account permissions, or registry acceptance.
5. Run `npm publish` to publish the release. Complete npm's authentication prompts when requested.

`prepublishOnly` runs the full checks and the packaged CLI smoke test before publishing. `prepare` builds the CLI and browser assets for local installation, packing, and GitHub installation. Only compiled files, documentation, package metadata, and the license are shipped.

After publishing, verify from another directory:

```bash
npm install -g kendai-md
kendai --version
kendai
# Or, without a global installation:
npx kendai-md
```

See the [npm lifecycle documentation](https://docs.npmjs.com/cli/v10/using-npm/scripts/) for the build and publish hooks.

See [npm publishing authentication requirements](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/) for current authentication guidance.
