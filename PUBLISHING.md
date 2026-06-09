# Publishing Guide

This guide explains how to publish a new version of @eazo/sdk to NPM.

## Prerequisites

1. **NPM Account**: You need an NPM account with publish permissions for the `@eazo` scope
2. **NPM Token**: Create an automation token in your NPM account:
   - Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Click "Generate New Token"
   - Select "Automation" type
   - Copy the token

3. **GitHub Secret**: Add the NPM token to GitHub:
   - Go to your repository settings
   - Navigate to "Secrets and variables" → "Actions"
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Paste your NPM automation token

## Publishing Process

### Automatic Publishing (Recommended)

The package is automatically published when you push a git tag:

```bash
# Create and push a tag
git tag 0.0.1
git push origin 0.0.1

# Or with v prefix
git tag v1.0.0
git push origin v1.0.0

# Or with V prefix
git tag V1.0.0
git push origin V1.0.0
```

The CI will:
1. ✅ Extract version from tag (removes v/V prefix)
2. ✅ Install dependencies
3. ✅ Run tests
4. ✅ Build TypeScript
5. ✅ Update package.json version
6. ✅ Determine the npm dist-tag from the version string
7. ✅ Publish to NPM under the resolved dist-tag
8. ✅ Create GitHub Release

> **Note**: You do **not** need to edit `sdk/package.json` before tagging. The CI overwrites the `version` field from the tag (`npm version ... --allow-same-version`), so the committed `package.json` version can stay as-is.

### Supported Tag Formats

All these formats work:
- `0.0.1` → publishes as `0.0.1`
- `v0.0.1` → publishes as `0.0.1`
- `V0.0.1` → publishes as `0.0.1`
- `1.2.3` → publishes as `1.2.3`
- `v1.2.3` → publishes as `1.2.3`

### Pre-release (alpha / beta / rc)

The CI picks the npm **dist-tag** automatically from the version string, so pre-releases never overwrite `latest`:

| Version contains | dist-tag | Install command |
|---|---|---|
| `-alpha` | `alpha` | `npm install @eazo/sdk@alpha` |
| `-beta` | `beta` | `npm install @eazo/sdk@beta` |
| `-rc` | `rc` | `npm install @eazo/sdk@rc` |
| (none) | `latest` | `npm install @eazo/sdk` |

Publish an alpha by pushing a pre-release tag:

```bash
# Alpha for the next unreleased version
git tag v0.21.0-alpha.0
git push origin v0.21.0-alpha.0

# Iterate the next alpha
git tag v0.21.0-alpha.1
git push origin v0.21.0-alpha.1
```

`npm install @eazo/sdk` (i.e. `@latest`) is unaffected — it keeps resolving to the most recent stable release. Only `@eazo/sdk@alpha` (or the exact version) pulls the pre-release.

**Versioning note**: a pre-release like `0.21.0-alpha.1` sorts *before* its stable counterpart `0.21.0`. Target the next unreleased version (e.g. alpha for `0.21.0` while `0.20.0` is the current stable) rather than appending `-alpha` to an already-published version number.

### Manual Publishing

If you need to publish manually:

```bash
cd sdk

# Update version in package.json
npm version 1.0.0 --no-git-tag-version

# Login to NPM (first time only)
npm login

# Build and test
npm run build
npm test

# Publish a stable release
npm publish --access public

# Or publish a pre-release (do NOT forget --tag, or it overwrites latest)
npm version 0.21.0-alpha.0 --no-git-tag-version
npm publish --access public --tag alpha
```

## Version Guidelines

Follow [Semantic Versioning](https://semver.org/):

- **Major version** (1.0.0 → 2.0.0): Breaking changes
- **Minor version** (1.0.0 → 1.1.0): New features, backward compatible
- **Patch version** (1.0.0 → 1.0.1): Bug fixes, backward compatible

## Pre-release Checklist

Before creating a release tag:

- [ ] Update version in `package.json` (optional, CI will do it)
- [ ] Update `CHANGELOG.md` with changes
- [ ] Run tests locally: `npm test`
- [ ] Build locally: `npm run build`
- [ ] Update documentation if needed
- [ ] Commit all changes

## Troubleshooting

### CI fails with "npm ERR! 403 Forbidden"

**Solution**: Check that:
1. `NPM_TOKEN` secret is set correctly in GitHub
2. Your NPM account has permissions for `@eazo` scope
3. The token hasn't expired

### CI fails with "tag already exists"

**Solution**: Delete the remote tag and recreate:
```bash
git tag -d 1.0.0
git push origin :refs/tags/1.0.0
git tag 1.0.0
git push origin 1.0.0
```

### Package already published

**Solution**: NPM doesn't allow republishing the same version. Increment the version:
```bash
git tag 1.0.1
git push origin 1.0.1
```

## Post-publish

After successful publishing:

1. ✅ Verify on NPM: https://www.npmjs.com/package/@eazo/sdk
2. ✅ Test installation: `npm install @eazo/sdk@latest`
3. ✅ Check GitHub Release was created
4. ✅ Update documentation if needed
5. ✅ Announce the release (if major version)

## CI Workflow File

The workflow is defined in `.github/workflows/publish.yml`. It:
- Triggers on any tag push
- Extracts version from tag name
- Runs tests before publishing
- Publishes to NPM with public access
- Creates a GitHub Release

For more details, see the workflow file.
