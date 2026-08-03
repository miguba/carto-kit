# Carto Kit npm release

This repository publishes only `carto-kit`. A semantic version tag triggers the
GitHub Actions Trusted Publishing workflow; ordinary branch commits never publish.

## Release

1. Choose an unpublished version and update `packages/carto-kit/package.json` and
   `package-lock.json` to that exact version.
2. Validate the exact version locally:

   ```bash
   npm run release:npm -- 0.1.35 --dry-run
   ```

3. Commit and push the intended changes to `origin/main`.
4. Create and push an annotated tag matching the package version exactly:

   ```bash
   git tag -a v0.1.35 -m "Release v0.1.35"
   git push origin v0.1.35
   ```

The tag-triggered workflow runs tests, verifies that the tag matches the package
version, and publishes through npm Trusted Publishing with GitHub OIDC. It does
not use `NODE_AUTH_TOKEN` or `npm login`.

Never move, reuse, force-push, or delete a published release tag. Local
`npm publish` is an explicit emergency fallback, not the standard release path.
