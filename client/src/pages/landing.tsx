import StarWarsLogin from "@/components/StarWarsLogin";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return <StarWarsLogin onLogin={handleLogin} />;
}