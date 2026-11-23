import { jest } from "@jest/globals";
import * as core from "../__fixtures__/core.js";

jest.unstable_mockModule("@actions/core", () => core);

const { run } = await import("../src/main.js");

describe("run", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("warns that nothing is published yet", async () => {
    core.getInput.mockReturnValue("26104");

    await run();

    expect(core.getInput).toHaveBeenCalledWith("dashboard-id", {
      required: true,
    });
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("26104"));
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("fails without a dashboard ID", async () => {
    core.getInput.mockImplementation(() => {
      throw new Error("Input required and not supplied: dashboard-id");
    });

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      "Input required and not supplied: dashboard-id",
    );
  });

  it("fails with the text of a thrown value that is not an error", async () => {
    core.getInput.mockImplementation(() => {
      throw "no input";
    });

    await run();

    expect(core.setFailed).toHaveBeenCalledWith("no input");
  });
});
