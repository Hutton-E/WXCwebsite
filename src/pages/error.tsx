import { useLocation } from "react-router-dom";
interface ErrorPageState {
  message?: string;
  code?: number;
}

function ErrorPage() {
  const location = useLocation();

  const state = (location.state as ErrorPageState) || {};
  const message = state.message || "Something went wrong.";
  const code = state.code || 404;

  return (
    <div className="error-page">
      <h1 className="error-code acme-regular text-outline">{code}</h1>
      <h2 className="error-message acme-regular text-outline">{message}</h2>
    </div>
  );
}
export default ErrorPage;
