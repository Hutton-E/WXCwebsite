import wartburgLogo from "../assets/still_pictures/wartburg_knights_logo_main.png";
import NavMenu from "../components/navMenu";
import IdentityLookup from "../components/identityLookup";
import SwitchIdentityPrompt from "../components/switchIdentity";
import { useUser } from "../context/UserContext";

const resourceLinks = [
  { label: "View Mileage", path: "/mileage" },
  { label: "View Core", path: "/core" },
  { label: "View FMS", path: "/fms" },
  { label: "View Lifting Sheet", path: "/lifting_sheet" },
];

const statsLinks = [
  { label: "View TFRRS Stats", path: "/tfrrs-stats" },
  { label: "View Personal Records", path: "/personal-records" },
  { label: "View Season Bests", path: "/season-bests" },
];

function Home() {
  const { athlete } = useUser();

  return (
    <>
      <img src={wartburgLogo} className="framework" alt="Wartburg Logo" />

      <h1 className="welcome-text acme-regular text-outline">
        {athlete
          ? `Welcome, ${athlete.name}`
          : "Welcome, please type your name and select it to view resources."}
      </h1>

      {!athlete && <IdentityLookup />}
      {athlete && (
        <>
          <nav className="left-res-drop">
            <NavMenu label="View WXC Resources" items={resourceLinks} />
          </nav>
          <nav className="mid-res-drop">
            <NavMenu label="View Personal Stats" items={statsLinks} />
          </nav>

          <SwitchIdentityPrompt />
        </>
      )}
    </>
  );
}

export default Home;
