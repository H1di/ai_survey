// Occupation map — the honest version of a decorative particle field. Every
// dot is a real O*NET occupation, placed by its measured interest profile on
// the RIASEC hexagon. Shipped as the result card's figure (OutputFieldFigure →
// OccupationMap): the shortlist marked, the pick ringed. ?view=hero keeps the
// original study — the same field behind a mock of the entry hero.
import DemoShell from "../kit/DemoShell";
import occupations from "../data/occupations.json";
import profile from "../data/demo-profile.json";
import { projectRiasec } from "../kit/riasecPlane";
import MapCanvas from "../../src/motion/map/MapCanvas";
import { STAGES, buildField, buildMarks } from "../../src/motion/map/mapEngine";
import "../../src/motion/map/map.css";
import "./map-demo.css";

const field = buildField(occupations);
// ?view=hero shows the ambient field behind hero copy (the original study);
// the default is the figure the result card ships.
const HERO = new URLSearchParams(window.location.search).get("view") === "hero";
const marks = buildMarks(field, { shortlist: profile.shortlist, chosen: profile.chosen.soc });
const you = projectRiasec(profile.riasecScores);

function Figure({ clock }) {
  return (
    <div className="omap-demo-figure">
      <MapCanvas
        variant="figure"
        field={field}
        marks={marks}
        you={you}
        T={clock.T}
        reducedMotion={clock.reducedMotion}
        ariaLabel={`${profile.chosen.title} marked among the ${profile.shortlist.length} occupations whose measured O*NET interest profiles sit closest to the ${profile.riasecCode} profile, on the RIASEC hexagon of all ${occupations.length} occupations.`}
      />
    </div>
  );
}

function Hero({ clock }) {
  return (
    <div className="omap">
      <div className="omap-box">
        <MapCanvas
          field={field}
          T={clock.T}
          reducedMotion={clock.reducedMotion}
          ariaLabel={`${occupations.length} occupations, each placed on the six-type RIASEC hexagon by its measured O*NET interest profile.`}
        >
          <h2 className="omap-title">
            What would you do
            <br />
            if you knew you
            <br />
            would definitely
            <br />
            <span className="omap-accent">succeed?</span>
          </h2>
          <p className="omap-lede">
            Write one honest answer. Your personality, interests and values are then matched
            against measured occupations, not guesses.
          </p>
        </MapCanvas>
      </div>
    </div>
  );
}

export default function Demo() {
  return (
    <DemoShell
      slug="occupation-map"
      title="The space of work is measured"
      explains={
        HERO
          ? `${occupations.length} real occupations, each placed by its O*NET interest profile — the field behind a block of copy.`
          : `Where the pick sits: ${occupations.length} real occupations placed by their O*NET interest profiles, the 15 closest to you marked, the pick ringed.`
      }
      stages={STAGES}
      footnote={profile.onetAttribution}
    >
      {(clock) => (HERO ? <Hero clock={clock} /> : <Figure clock={clock} />)}
    </DemoShell>
  );
}
