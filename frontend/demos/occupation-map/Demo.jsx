// Occupation map — the honest version of a decorative particle field. Every
// dot is a real O*NET occupation, placed by its measured interest profile on
// the RIASEC hexagon. Behind a mock of the entry hero, to prove the copy stays
// readable over the busiest frame.
import DemoShell from "../kit/DemoShell";
import occupations from "../data/occupations.json";
import profile from "../data/demo-profile.json";
import MapCanvas from "./MapCanvas";
import { STAGES, buildField } from "./mapEngine";
import "./map.css";

const field = buildField(occupations);

export default function Demo() {
  return (
    <DemoShell
      slug="occupation-map"
      title="The space of work is measured"
      explains={`${occupations.length} real occupations, each placed by its O*NET interest profile — the field behind the first screen.`}
      stages={STAGES}
      footnote={profile.onetAttribution}
    >
      {(clock) => (
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
      )}
    </DemoShell>
  );
}
