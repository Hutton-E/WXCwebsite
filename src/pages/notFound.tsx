import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function NotFoundPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/error", {
      replace: true,
      state: {
        code: 404,
        message:
          "Oops! Looks like this page could not be found right now. Please reload the website in another browser/tab.",
      },
    });
  }, [navigate]);

  return null;
}

export default NotFoundPage;
