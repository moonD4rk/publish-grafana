# Contributing

Issues and pull requests are welcome.

```sh
npm ci          # with the Node.js version in .node-version
npm run all     # format, lint, test and rebuild dist/
npm run local   # run the action with the inputs in .env, copied from .env.example
```

- Commit the rebuilt `dist/` with the change to `src/`: CI rejects a stale one.
- Titles follow Conventional Commits: `<type>(<scope>): <imperative summary>`.
- Tests never touch the network, and nothing writes to a dashboard other than the demo one in `demo/`.
- The design is in [`rfcs/`](rfcs/0001-design.md).
