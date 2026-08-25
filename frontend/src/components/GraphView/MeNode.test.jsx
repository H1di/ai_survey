import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { MeNode } from "./NodeComponent";

describe("MeNode", () => {
  it("carries the design's caption under the circle", () => {
    render(
      <ReactFlowProvider>
        <MeNode />
      </ReactFlowProvider>
    );
    expect(screen.getByText("Me")).toBeInTheDocument();
    expect(screen.getByText("invector · life path model")).toBeInTheDocument();
  });
});
