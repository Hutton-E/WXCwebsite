import NavMenu from "../components/navMenu";
import IdentityLookup from "../components/identityLookup";
import SwitchIdentityPrompt from "../components/switchIdentity";
import { useUser } from "../context/UserContext";
import { Link } from "react-router-dom";

const resourceLinks = [
  { label: "View Mileage", path: "/mileage" },
  { label: "View Workouts", path: "/workouts" },
  { label: "View Core", path: "/core" },
  { label: "View FMS Correctives", path: "/fms" },
  { label: "View Lifting Sheet", path: "/lifting_sheet" },
];

const statsLinks = [{ label: "View TFRRS Stats", path: "/tfrrs-stats" }];
const commonLinks = [
  { label: "View Core", path: "/core" },
  { label: "View Schedule", path: "/season-schedule" },
];

function Home() {
  const { athlete, athleteId, athleteLoading } = useUser();

  if (athleteId && athleteLoading) {
    return null;
  }

  return (
    <div className="home-content">

      <h1 className="welcome-text acme-regular text-outline">
        {athlete
          ? `Welcome, ${athlete.name}`
          : "Welcome, please type your name and select it to view resources."}
      </h1>

      <div className={`home-center-controls${athlete ? " has-athlete" : ""}`}>
        {!athlete && <IdentityLookup />}

        <nav className="common-links">
          <NavMenu label="Common Links" items={commonLinks} />
        </nav>
      </div>

      <div className="home-admin-login">
        <Link to="/admin" className="admin-login-link acme-regular text-outline">
          Admin Login?
        </Link>
      </div>

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
    </div>
  );
}

export default Home;
