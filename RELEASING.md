# Releasing

Releasing a new version of the runner is facilitated through a specific GitHub Action.

## How to Release

To initiate a release, trigger the [Release New Version](../../actions/workflows/release.yml) workflow manually. This process does not require the creation of a tag or a release beforehand, as these steps are automated.

Releases can be made from the `main` branch or any other branch, offering flexibility in the development process.

### Available Settings
- **Release Type**: Choose from `major`, `minor`, or `patch`, following [SemVer](https://semver.org/) guidelines.
- **Pre-Release Flavor**: Options include `rc`, `beta`, or custom labels. Omitting this setting assumes a stable and complete release.

#### Note:
When updating an existing pre-release, avoid specifying a new release type to maintain version continuity.

### Examples of Release Behavior

The behavior of the release process varies based on the inputs provided:

| Current Version | Release Type | Pre-Release Flavor | New Version |
|-----------------|--------------|--------------------|-------------|
| 1.5.7           | major        |                    | 2.0.0       |
| 1.5.7           | major        | rc                 | 2.0.0-rc.0  |
| 2.0.0-rc.0      |              | rc                 | 2.0.0-rc.1  |
| 2.0.0-rc.1      | major        |                    | 2.0.0       |

#### Important:

Ensure not to consecutively specify both a release type and a pre-release flavor more than once to prevent unintended version increments.

| Current Version | Release Type | Pre-Release Flavor | Resulting Version |
|-----------------|--------------|--------------------|-------------------|
| 1.5.7           | major        | rc                 | 2.0.0-rc.0        |
| 2.0.0-rc.0      | major        | rc                 | ***3.0.0-rc.0***  |
