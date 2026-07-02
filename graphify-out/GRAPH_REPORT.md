# Graph Report - .  (2026-07-02)

## Corpus Check
- 48 files · ~81,242 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 322 nodes · 455 edges · 22 communities (17 shown, 5 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 42 edges (avg confidence: 0.64)
- Token cost: 152,336 input · 16,923 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Adaptive Question Engine|Adaptive Question Engine]]
- [[_COMMUNITY_Client Graph Page & Modals|Client Graph Page & Modals]]
- [[_COMMUNITY_Frontend Session Client & Cards|Frontend Session Client & Cards]]
- [[_COMMUNITY_AI Branch Engine & Fallbacks|AI Branch Engine & Fallbacks]]
- [[_COMMUNITY_Frontend Build Config (Vite)|Frontend Build Config (Vite)]]
- [[_COMMUNITY_Project Docs & Architecture Concepts|Project Docs & Architecture Concepts]]
- [[_COMMUNITY_Session Store|Session Store]]
- [[_COMMUNITY_Legacy Express Server (server)|Legacy Express Server (server/)]]
- [[_COMMUNITY_Backend Package Config|Backend Package Config]]
- [[_COMMUNITY_Client Build Config (CRA)|Client Build Config (CRA)]]
- [[_COMMUNITY_Server Package Config (legacy)|Server Package Config (legacy)]]
- [[_COMMUNITY_GraphView NodeEdge Components|GraphView Node/Edge Components]]
- [[_COMMUNITY_Root Workspace Scripts|Root Workspace Scripts]]
- [[_COMMUNITY_UI Icon Sprite Sheet|UI Icon Sprite Sheet]]
- [[_COMMUNITY_Branch Animation Asset|Branch Animation Asset]]
- [[_COMMUNITY_Hero Brand Illustration|Hero Brand Illustration]]
- [[_COMMUNITY_Static Survey Questions|Static Survey Questions]]
- [[_COMMUNITY_Favicon Brand Mark|Favicon Brand Mark]]
- [[_COMMUNITY_Vite Logo Asset|Vite Logo Asset]]
- [[_COMMUNITY_React Logo Asset|React Logo Asset]]

## God Nodes (most connected - your core abstractions)
1. `SessionStore` - 21 edges
2. `App()` - 14 edges
3. `request()` - 10 edges
4. `useApp()` - 7 edges
5. `scripts` - 7 edges
6. `UI Icon Sprite Sheet` - 6 edges
7. `cleanText()` - 5 edges
8. `fallbackInitialBranch()` - 5 edges
9. `pickNextQuestion()` - 5 edges
10. `scripts` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Adaptive Question Engine (38-question pool)` --semantically_similar_to--> `Home to Questions to Graph flow`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Static IPIP-20/IPIP-50 fallback item pool` --semantically_similar_to--> `Deterministic fallback branch generator`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-05-21-new-question-architecture.md → README.md
- `createAiEngine()` --indirect_call--> `evolveBranch()`  [INFERRED]
  backend/aiEngine.js → frontend/src/api.js
- `createAiEngine()` --indirect_call--> `generateInitialBranch()`  [INFERRED]
  backend/aiEngine.js → frontend/src/api.js
- `Life Path Explorer HTML shell (CRA)` --implements--> `Life Path Explorer (CLAUDE.md project spec)`  [INFERRED]
  client/public/index.html → CLAUDE.md

## Import Cycles
- 1-file cycle: `client/src/pages/Questions.jsx -> client/src/pages/Questions.jsx`

## Hyperedges (group relationships)
- **Three-stage assessment (Demographics to Big Five to Values)** — docs_superpowers_plans_2026_05_21_new_question_architecture_demographics, docs_superpowers_plans_2026_05_21_new_question_architecture_big_five, docs_superpowers_plans_2026_05_21_new_question_architecture_values_inventory, docs_superpowers_plans_2026_05_21_new_question_architecture_step_machine [EXTRACTED 1.00]
- **Profile digest feeds branch generation** — docs_superpowers_plans_2026_05_21_new_question_architecture_scoring, docs_superpowers_plans_2026_05_21_new_question_architecture_profile_digest, readme_branch_engine, readme_branch_themes [INFERRED 0.85]

## Communities (22 total, 5 thin omitted)

### Community 0 - "Adaptive Question Engine"
Cohesion: 0.08
Nodes (39): buildProgress(), computeBigFiveScores(), computeValuesScores(), {
  DEMOGRAPHIC_QUESTIONS,
  DEMOGRAPHIC_BY_ID,
  VALUES_DIMENSIONS,
  VALUES_QUESTIONS,
  VALUES_BY_ID,
}, deriveBigFiveTraits(), describeTraits(), httpErr(), pickNextBigFive() (+31 more)

### Community 1 - "Client Graph Page & Modals"
Cohesion: 0.10
Nodes (24): App(), BranchEdge(), defaultEdgeOptions, edgeTypes, GraphView(), nodeTypes, DetailPanel(), LoadingNode() (+16 more)

### Community 2 - "Frontend Session Client & Cards"
Cohesion: 0.16
Nodes (19): createAiEngine(), chooseBigFiveDepth(), createThematicBranch(), evolveBranch(), generateInitialBranch(), request(), startSession(), submitBigFiveAnswer() (+11 more)

### Community 3 - "AI Branch Engine & Fallbacks"
Cohesion: 0.13
Nodes (23): { BRANCH_THEMES, VALUES_DIMENSIONS }, {
  buildProfileDigest,
  buildBigFiveItemsPrompt,
  buildInitialBranchPrompts,
  buildEvolutionPrompts,
}, buildSessionDigest(), cleanText(), fallbackEvolution(), fallbackInitialBranch(), { getFallbackItems }, getTheme() (+15 more)

### Community 4 - "Frontend Build Config (Vite)"
Cohesion: 0.08
Nodes (25): dependencies, framer-motion, react, react-dom, reactflow, @xyflow/react, devDependencies, eslint (+17 more)

### Community 5 - "Project Docs & Architecture Concepts"
Cohesion: 0.11
Nodes (23): AppContext useReducer store, Home to Questions to Graph flow, Life Path Explorer (CLAUDE.md project spec), Tradeoff modal expansion flow, Life Path Explorer HTML shell (CRA), AI-generated Big Five (OCEAN) assessment, Demographic questions stage, Derived higher-order traits (Stability/Plasticity) (+15 more)

### Community 7 - "Legacy Express Server (server/)"
Cohesion: 0.16
Nodes (16): app, cors, express, pathsRouter, express, { generateInitialPaths, generateTradeoffQuestions, expandBranch }, router, { buildInitialPathsPrompt, buildExpansionPrompt, buildTradeoffQuestionsPrompt } (+8 more)

### Community 8 - "Backend Package Config"
Cohesion: 0.11
Nodes (18): author, dependencies, cors, dotenv, express, openai, description, devDependencies (+10 more)

### Community 9 - "Client Build Config (CRA)"
Cohesion: 0.11
Nodes (17): browserslist, development, production, dependencies, framer-motion, react, react-dom, react-router-dom (+9 more)

### Community 10 - "Server Package Config (legacy)"
Cohesion: 0.14
Nodes (13): dependencies, cors, dotenv, express, openai, devDependencies, nodemon, main (+5 more)

### Community 11 - "GraphView Node/Edge Components"
Cohesion: 0.22
Nodes (10): BranchEdge(), defaultEdgeOptions, edgeTypes, GraphView(), nodeTypes, DetailPanel(), LoadingNode(), MeNode() (+2 more)

### Community 12 - "Root Workspace Scripts"
Cohesion: 0.17
Nodes (11): devDependencies, concurrently, name, scripts, build, dev, dev:backend, dev:frontend (+3 more)

### Community 13 - "UI Icon Sprite Sheet"
Cohesion: 0.48
Nodes (7): Bluesky Icon, Discord Icon, Documentation Icon, UI Icon Sprite Sheet, GitHub Icon, Social Icon, X (Twitter) Icon

### Community 14 - "Branch Animation Asset"
Cohesion: 0.60
Nodes (5): Branch Animation GIF, Branching Path Visualization, Graph Expansion Animation, Life Path Explorer, Origin Root Node

### Community 15 - "Hero Brand Illustration"
Cohesion: 0.50
Nodes (5): Brand Visual Identity, Hero Illustration, Isometric Stacked Cards, Outlined Top Card, Purple Gradient Base Card

## Knowledge Gaps
- **130 isolated node(s):** `OpenAI`, `{
  buildProfileDigest,
  buildBigFiveItemsPrompt,
  buildInitialBranchPrompts,
  buildEvolutionPrompts,
}`, `{ BRANCH_THEMES, VALUES_DIMENSIONS }`, `{ getFallbackItems }`, `MINI_IPIP_20` (+125 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createAiEngine()` connect `Frontend Session Client & Cards` to `Adaptive Question Engine`, `AI Branch Engine & Fallbacks`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `SessionStore` connect `Session Store` to `Adaptive Question Engine`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **What connects `OpenAI`, `{
  buildProfileDigest,
  buildBigFiveItemsPrompt,
  buildInitialBranchPrompts,
  buildEvolutionPrompts,
}`, `{ BRANCH_THEMES, VALUES_DIMENSIONS }` to the rest of the system?**
  _131 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Adaptive Question Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.07822410147991543 - nodes in this community are weakly interconnected._
- **Should `Client Graph Page & Modals` be split into smaller, more focused modules?**
  _Cohesion score 0.09982174688057041 - nodes in this community are weakly interconnected._
- **Should `AI Branch Engine & Fallbacks` be split into smaller, more focused modules?**
  _Cohesion score 0.12615384615384614 - nodes in this community are weakly interconnected._
- **Should `Frontend Build Config (Vite)` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._