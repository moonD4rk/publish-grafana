import { jest } from "@jest/globals";

export const debug = jest.fn();
export const info = jest.fn();
export const notice = jest.fn();
export const warning = jest.fn();
export const setFailed = jest.fn();
export const setOutput = jest.fn();
export const setSecret = jest.fn();
export const getInput = jest.fn();
export const getMultilineInput = jest.fn();
export const getBooleanInput = jest.fn();

const chain = () => summary;
export const summary = {
  addHeading: jest.fn(chain),
  addTable: jest.fn(chain),
  addLink: jest.fn(chain),
  write: jest.fn(async () => summary),
};

export function setInputs(inputs) {
  getInput.mockImplementation((name, options) => {
    const value = inputs[name] ?? "";
    if (options?.required && !value) {
      throw new Error(`Input required and not supplied: ${name}`);
    }
    return value;
  });
  getMultilineInput.mockImplementation((name) =>
    (inputs[name] ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
  getBooleanInput.mockImplementation((name) => {
    if (!["true", "false"].includes(inputs[name])) {
      throw new TypeError(`Input does not meet YAML 1.2: ${name}`);
    }
    return inputs[name] === "true";
  });
}
