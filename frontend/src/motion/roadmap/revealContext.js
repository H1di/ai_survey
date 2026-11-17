import { createContext } from "react";

// { T, timeline } or null. GraphView's RoadmapReveal provides it once the
// roadmap lands; motion/path/RoadmapPath reads it and paints the frame at T.
// Exported so a scrubbable clock (the demo) can provide its own T. With no
// provider the path renders in its final state.
export const RevealContext = createContext(null);
