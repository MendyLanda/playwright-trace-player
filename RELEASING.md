# Releasing

The version in `package.json` controls npm releases. A push to `main` publishes only when npm does not already have that version. The same workflow creates the matching `vX.Y.Z` GitHub release.

Choose the next version:

```sh
npm run version:patch
# or: npm run version:minor
# or: npm run version:major
```

Commit both `package.json` and `package-lock.json`, then push or merge the change into `main`. The `Publish package` workflow runs all checks and publishes through npm trusted publishing. It stores no npm token in GitHub.

npm versions cannot be replaced. If a publish fails after npm accepts the package, rerun the workflow; it will skip the existing npm version and ensure the GitHub release exists.
