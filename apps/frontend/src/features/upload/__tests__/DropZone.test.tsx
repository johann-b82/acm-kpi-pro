import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DropZone } from "../components/DropZone.js";

function makeFile(name: string, sizeBytes: number, type = "text/plain"): File {
  // Build a File with an artificial size by buffering a matching-length string.
  // For size-limit tests we need size > 10 MB, so we stub the `size` property.
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

function dropFiles(target: HTMLElement, files: File[]) {
  fireEvent.drop(target, {
    dataTransfer: { files, types: ["Files"] },
  });
}

describe("DropZone", () => {
  it("extension: rejects .xlsx file with inline error message", () => {
    const onFileSelected = vi.fn();
    const { container } = render(<DropZone onFileSelected={onFileSelected} />);
    const dropArea = container.firstElementChild as HTMLElement;

    dropFiles(dropArea, [makeFile("bad.xlsx", 1000)]);

    expect(onFileSelected).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Only \.csv and \.txt files are accepted/i),
    ).toBeDefined();
  });

  it("extension: accepts .csv file and calls onChange", () => {
    const onFileSelected = vi.fn();
    const { container } = render(<DropZone onFileSelected={onFileSelected} />);
    const dropArea = container.firstElementChild as HTMLElement;

    const file = makeFile("good.csv", 1000, "text/csv");
    dropFiles(dropArea, [file]);

    expect(onFileSelected).toHaveBeenCalledTimes(1);
    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it("extension: accepts .txt file and calls onChange", () => {
    const onFileSelected = vi.fn();
    const { container } = render(<DropZone onFileSelected={onFileSelected} />);
    const dropArea = container.firstElementChild as HTMLElement;

    const file = makeFile("apollo-export.txt", 2000);
    dropFiles(dropArea, [file]);

    expect(onFileSelected).toHaveBeenCalledTimes(1);
    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it("size: rejects file >10MB with inline error message", () => {
    const onFileSelected = vi.fn();
    const { container } = render(<DropZone onFileSelected={onFileSelected} />);
    const dropArea = container.firstElementChild as HTMLElement;

    const huge = makeFile("huge.csv", 11 * 1024 * 1024);
    dropFiles(dropArea, [huge]);

    expect(onFileSelected).not.toHaveBeenCalled();
    expect(screen.getByText(/File too large — maximum 10 MB/i)).toBeDefined();
  });

  it("multi-drop: uses first file and shows warning when multiple files dropped", () => {
    const onFileSelected = vi.fn();
    const { container } = render(<DropZone onFileSelected={onFileSelected} />);
    const dropArea = container.firstElementChild as HTMLElement;

    const first = makeFile("first.csv", 1000, "text/csv");
    const second = makeFile("second.csv", 1000, "text/csv");
    dropFiles(dropArea, [first, second]);

    expect(onFileSelected).toHaveBeenCalledTimes(1);
    expect(onFileSelected).toHaveBeenCalledWith(first);
    expect(
      screen.getByText(/Only one file at a time — using first\.csv\./i),
    ).toBeDefined();
  });

  it("click: opens file picker on button click", () => {
    const onFileSelected = vi.fn();
    render(<DropZone onFileSelected={onFileSelected} />);

    const button = screen.getByRole("button", {
      name: /File upload area/i,
    });
    // Spy on the hidden input's click by replacing HTMLInputElement.prototype.click
    // for the duration of the test.
    const clickSpy = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => {});
    fireEvent.click(button);
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});
