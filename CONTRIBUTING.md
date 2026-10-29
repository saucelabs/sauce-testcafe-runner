# Contributing to `sauce-testcafe-runner`

**Thank you for your interest in `sauce-testcafe-runner`. We highly appreciate and welcome your contributions.**

## Ways to Get Involved

- **[Report a Bug](#report-a-bug)**: Identify and report any issues or bugs.
- **[Suggest a Feature](#suggest-a-feature)**: Propose ideas for new features or improvements.
- **[Contribute Code](#contribute-code)**: Help develop and enhance the project by contributing your coding skills.

For any assistance, please don't hesitate to reach out by opening an [issue](/issues).

## Report a Bug

Before reporting a bug, please check if there is an [existing issue](/issues) addressing the same concern. If such an issue exists, feel free to contribute by adding your comments.

To report a new bug:
- Open an issue summarizing the bug details.
- Label it as "bug."
- If you have a solution or a fix, wonderful! Please submit a pull request as outlined in the [Contribute Code](#contribute-code) section.

## Suggest a Feature

To suggest a new feature:
- Open a [new issue](../../issues/new).
- Describe the desired functionality and its use case.
- Label the issue as "feature."

## Contribute Code

### Code Contribution Workflow

1. **Explore Open Issues**: Browse through the [open issues](../../issues). You can either work on an existing issue or create a new one to discuss your ideas.
2. **Fork and Branch**: Fork the repository and create a branch from the `main` branch to base your work.
3. **Start a Pull Request**: Open a pull request and label it `work in progress`. Outline your contributions.
4. **Commit Your Changes**: Commit your changes in logical units. Ensure you sign off on your commits using `git commit -s -m "adding X to change Y"`.
5. **Engage**: Push your changes to your branch and update your pull request with any new information or completed tasks. Engage with feedback from project maintainers.
6. **Final Review**: Once completed, remove the `work in progress` label and request a final review from the maintainers.
7. **Approval**: Your pull request must receive approval from at least two [maintainers](MAINTAINERS).

### Commit Messages

Your commit messages should clearly articulate what changed and why:
- **Subject**: Briefly describe what was changed.
- **Body**: Explain why these changes were necessary.

Ensure the pull request description references the corresponding issue ID.

### Patched Dependencies

The runner ships a patched copy of `testcafe-browser-tools`, applied with [patch-package](https://github.com/ds300/patch-package) from `patches/` by the `postinstall` script. The patch makes Windows browser discovery best-effort: a failing PowerShell registry query logs a `TESTCAFE_BROWSER_TOOLS_REGISTRY_WARNING` line instead of stopping TestCafe before any test runs. TestCafe then launches the browser from the explicit browser path the runner passes to it.

TestCafe pins `testcafe-browser-tools` to an exact version, so the patch only needs attention when a TestCafe upgrade brings a new `testcafe-browser-tools` version. What happens then:

- **The old patch no longer applies:** the install fails in CI, and `scripts/bundle.sh` refuses to build a bundle without the patch.
- **The old patch still applies:** the install succeeds, but `patch-package` prints a "patch file version mismatch" warning. Regenerate the patch anyway (steps below), so the patch file name matches the installed version and the changes are checked against the new code.

#### Updating the patch for a new `testcafe-browser-tools` version

1. Install without applying the old patch:
   ```bash
   rm -rf node_modules && npm ci --ignore-scripts
   ```
2. Check whether upstream already fixed it. Look at `searchInRegistry()` and `findWindowsBrowsers()` in `node_modules/testcafe-browser-tools/lib/api/get-installations.js`. If failed PowerShell queries no longer throw, remove the patch instead (see below).
3. Re-apply the old patch to the new version. Fix any rejected hunks by hand:
   ```bash
   patch -p1 < patches/testcafe-browser-tools+<old-version>.patch
   ```
   Keep the patch's behavior and text unchanged:
   - Every PowerShell query is wrapped in `try/catch`. Find the helpers that call `execPowershell` with `grep -n execPowershell node_modules/testcafe-browser-tools/lib/api/get-installations.js`. In 2.0.26 these are `getRegistryKey()` and `getRegistryBrowserProperties()`. Then check that every call to those helpers is inside a `try/catch`. In 2.0.26 they're called from `searchInRegistry()` and `detectMicrosoftEdgeLegacy()`; the latter is wrapped where `findWindowsBrowsers()` calls it.
   - Failures go through `warnRegistryQueryFailed()`, which prints `TESTCAFE_BROWSER_TOOLS_REGISTRY_WARNING: <label> query exited with code <code>; <outcome>. stderr: <stderr>`. The runner's retry check (`isBrowserDiscoveryFailure()` in `src/testcafe-runner.ts`) matches this text.
   - The comment starting with `// SAUCE PATCH` stays. `scripts/bundle.sh` checks for the text `SAUCE PATCH`.
4. Delete any `.orig`/`.rej` files that `patch` left behind (otherwise `patch-package` adds them to the new patch), then regenerate the patch file and remove the old one:
   ```bash
   find node_modules/testcafe-browser-tools \( -name '*.orig' -o -name '*.rej' \) -delete
   npx patch-package testcafe-browser-tools
   git rm patches/testcafe-browser-tools+<old-version>.patch
   ```
5. Verify:
   ```bash
   rm -rf node_modules && npm ci   # must print "testcafe-browser-tools@<new-version> ✔"
   npm run build                   # unit tests import from the compiled lib/ folder
   npm test                        # includes tests/unit/patches/testcafe-browser-tools.spec.ts
   ```
   If the new version added or removed a PowerShell query, update the expected call and warning counts in `tests/unit/patches/testcafe-browser-tools.spec.ts`.

#### Removing the patch once upstream fixes it

Delete `patches/`, the `patch-package` dependency, the `postinstall` script, the `SAUCE PATCH` check in `scripts/bundle.sh`, the `patches/*.patch` rule in `.gitattributes`, and `tests/unit/patches/`. Keep `isBrowserDiscoveryFailure()` and its retry. If upstream logs failures differently, update the `TESTCAFE_BROWSER_TOOLS_REGISTRY_WARNING` pattern in `src/testcafe-runner.ts`, and any log monitoring that searches for it, in the same change.

### Developer Certificate of Origin

All contributions must adhere to the Developer Certificate of Origin (DCO) version 1.1, as documented at [developercertificate.org](http://developercertificate.org/). This implies that by submitting a contribution, you certify that you have the right to do so. Please include a "Signed-off-by" tag in every patch, which can be automated with a [Git hook](https://stackoverflow.com/questions/15015894/git-add-signed-off-by-line-using-format-signoff-not-working).

```bash
git commit -s -m "Describe your change"
```

**Enjoy contributing, and happy coding!**
