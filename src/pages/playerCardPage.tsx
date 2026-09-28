import PlayerCard from "../components/playerCard";
import { useUser } from "../context/UserContext";

function PlayerCardPage() {
  const { athlete } = useUser();

  if (!athlete) return null;

  return (
    <div className="player-card-page">
      <PlayerCard athlete={athlete} />
    </div>
  );
}

export default PlayerCardPage;
