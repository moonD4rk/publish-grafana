import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function createWorkspace(files) {
  const directory = mkdtempSync(path.join(tmpdir(), "publish-grafana-"));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(directory, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  process.env.GITHUB_WORKSPACE = directory;
  return () => {
    delete process.env.GITHUB_WORKSPACE;
    rmSync(directory, { recursive: true, force: true });
  };
}
