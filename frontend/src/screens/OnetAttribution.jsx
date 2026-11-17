// Required by the O*NET Web Services developer terms: the "O*NET in-it"
// badge linking to services.onetcenter.org plus the exact attribution
// sentence with the USDOL/ETA trademark acknowledgment. Keep the wording
// as published — it is a license condition. The badge is a local copy of
// onetcenter.org/image/link/onet-in-it.svg recoloured for the light theme
// (white backing rect removed so the page shows through; "o*net" and the
// swoosh #048 / #fd4 → ink #111, "in-it" on the swoosh → white). Only fills
// changed — keep the shapes themselves untouched.
import onetBadge from "../assets/onet-in-it.svg";

export default function OnetAttribution() {
  return (
    <div className="onet-attribution">
      <a
        href="https://services.onetcenter.org/"
        target="_blank"
        rel="noopener noreferrer"
        title="This site incorporates information from O*NET Web Services. Click to learn more."
      >
        <img
          src={onetBadge}
          width="130"
          height="60"
          alt="O*NET in-it"
        />
      </a>
      <p>
        This site incorporates information from{" "}
        <a href="https://services.onetcenter.org/" target="_blank" rel="noopener noreferrer">
          O*NET Web Services
        </a>{" "}
        by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA).
        O*NET&reg; is a trademark of USDOL/ETA.
      </p>
    </div>
  );
}
