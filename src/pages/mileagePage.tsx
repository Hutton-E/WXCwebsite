import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function MileagePage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/error", {
      replace: true,
      state: {
        message: "Uh oh, looks like this page isn't built yet. Check in later!",
        code: 404,
      },
    });
  }, [navigate]);

  return null;
}

export default MileagePage;
