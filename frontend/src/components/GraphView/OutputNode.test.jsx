import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { OutputNode } from "./NodeComponent";

const DATA = {
  jobTitle: "Financial Manager",
  orientedField: "Business & Sales",
  fit: 51,
  thesis: "Balanced traits and a strong priority on compensation point to a structured role.",
  market: "$166,570/yr median (US) · outlook: Bright",
  accepted: false,
  latest: true,
  onOpen: () => {},
};

function renderNode(data) {
  return render(
    <ReactFlowProvider>
      <OutputNode data={{ ...DATA, ...data }} />
    </ReactFlowProvider>
  );
}

describe("OutputNode", () => {
  it("composes the field tag and the values fit into one header row", () => {
    const { container } = renderNode();
    const head = container.querySelector(".node-output-head");
    expect(head).toBeTruthy();
    expect(head).toContainElement(screen.getByText("Business & Sales"));
    expect(head).toContainElement(screen.getByText("51% values fit"));
  });

  it("renders the thesis line under the title", () => {
    renderNode();
    expect(screen.getByText("Financial Manager")).toBeInTheDocument();
    expect(screen.getByText(DATA.thesis)).toBeInTheDocument();
  });

  it("shows salary and outlook in the meta row, US-flagged", () => {
    const { container } = renderNode();
    const meta = container.querySelector(".node-meta");
    expect(meta).toContainElement(screen.getByText(DATA.market));
    expect(meta.textContent).toContain("(US)");
  });

  it("marks the accepted output in the meta row", () => {
    renderNode({ accepted: true });
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  // Salary and outlook come from the live O*NET API, so both are absent
  // without ONET_API_KEY. The meta row must then disappear rather than paint
  // a stray separator.
  it("drops the meta row entirely when there is no market data", () => {
    const { container } = renderNode({ market: "" });
    expect(container.querySelector(".node-meta")).toBeNull();
  });

  it("keeps the Accepted mark when market data is missing", () => {
    const { container } = renderNode({ market: "", accepted: true });
    const meta = container.querySelector(".node-meta");
    expect(meta.textContent.trim()).toBe("Accepted");
  });

  it("omits the fit half of the header row when no fit was scored", () => {
    const { container } = renderNode({ fit: null });
    const head = container.querySelector(".node-output-head");
    expect(head.textContent.trim()).toBe("Business & Sales");
  });
});
