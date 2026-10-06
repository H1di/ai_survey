// Required by the O*NET Web Services developer terms: the "O*NET in-it"
// badge linking to services.onetcenter.org plus the exact attribution
// sentence with the USDOL/ETA trademark acknowledgment. Keep the wording
// as published — it is a license condition. The badge is a local copy of
// onetcenter.org/image/link/onet-in-it.svg adapted for the dark theme
// (white backing rect removed, "o*net" → bone, swoosh → gold,
// "in-it" on the swoosh → page ink); keep the shapes themselves untouched.
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
