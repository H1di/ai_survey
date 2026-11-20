import "@testing-library/jest-dom";

// jsdom ships no 2D canvas context and warns on every getContext call.
// BranchCanvas already treats a null context as "cannot draw" and no-ops,
// which is exactly the behaviour under test — so return null quietly rather
// than let the warning bury real output.
HTMLCanvasElement.prototype.getContext = () => null;
