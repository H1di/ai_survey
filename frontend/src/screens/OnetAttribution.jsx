// Required by the O*NET Web Services developer terms: the "O*NET in-it"
// badge linking to services.onetcenter.org plus the exact attribution
// sentence with the USDOL/ETA trademark acknowledgment. Keep the wording
// and the badge artwork as published — they are license conditions.
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
          src="https://www.onetcenter.org/image/link/onet-in-it.svg"
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
