# General Guidelines

- when asking questions, ask them one at a time
- read the full contents of a file every time, never subsets so you don't miss important context

## TypeScript Guidelines

- when adding a package to a project add it with an install command: do not manually edit the package.json file.
- run check/format/lint commands when done making a change. If the commands don't exist, suggest making them for the project you're in.
- `as any` should be an absolute last resort. Always use real type safety. Lean on type inference instead of manually writing new types over and over again.
- avoid running `dev` or `build` commands. If you really need to, ask first.
