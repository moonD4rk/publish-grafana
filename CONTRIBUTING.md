# Contributing

Issues and pull requests are welcome. The design lives in [`rfcs/`](rfcs/README.md): RFC 0001 says what the action does, RFC 0002 how it is built, and `facts.md` what it relies on about grafana.com.

## Setup

Use the Node.js version in `.node-version`, then install the dependencies:

```sh
npm ci
```

## Checks

```sh
npm run all
```

This formats the files, lints them, runs the unit tests and rebuilds `dist/`. CI runs the same checks and rejects a pull request whose `dist/` differs from a fresh build, so commit the rebuilt `dist/` together with the change to `src/`.

## Running the action locally

Copy `.env.example` to `.env`, which git ignores, set the inputs there and run:

```sh
npm run local
```

## Rules

- A change in behavior updates RFC 0001 in the same pull request.
- Anything the code relies on about grafana.com is an entry in `rfcs/facts.md`, pinned by a test that names it.
- Tests never touch the network, and nothing writes to a listing other than the demo listing.
- Commit and pull request titles follow Conventional Commits, `<type>(<scope>): <imperative summary>`, in 64 characters or fewer.
- `.gitignore` is an allowlist: a new file or directory at the top level needs a line there.
- An action from outside this repository is pinned by its commit SHA in a workflow.

## Releases

A maintainer releases by pushing a tag `vX.Y.Z` on a commit of `main`. The release workflow checks the commit, creates the GitHub release and moves the major tag, such as `v1`.
