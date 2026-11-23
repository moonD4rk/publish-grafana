import { readFileSync } from "node:fs";

const read = (name) =>
  readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

function actionKeys(section) {
  const keys = [];
  let inside = false;
  for (const line of read("action.yml").split("\n")) {
    if (/^\S/.test(line)) {
      inside = line === `${section}:`;
    } else if (inside) {
      const key = line.match(/^ {2}([\w-]+):/);
      if (key) keys.push(key[1]);
    }
  }
  return keys;
}

function readmeKeys(heading) {
  const section = read("README.md")
    .split(/^## /m)
    .find((part) => part.startsWith(`${heading}\n`));
  return [...section.matchAll(/^\| `([\w-]+)` \|/gm)].map((row) => row[1]);
}

describe("action.yml", () => {
  it.each([
    ["inputs", "Inputs"],
    ["outputs", "Outputs"],
  ])("names the same %s as the README", (section, heading) => {
    const keys = actionKeys(section);

    expect(keys).not.toHaveLength(0);
    expect(keys).toEqual(readmeKeys(heading));
  });
});
