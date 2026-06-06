const message =
  "Astro sessions are disabled in this Carto template. Configure a real session driver before using Astro.session.";

function disabledSessionMethod() {
  throw new Error(message);
}

export default function disabledSessionDriver() {
  return {
    name: "carto-disabled-session",
    getItem: disabledSessionMethod,
    setItem: disabledSessionMethod,
    removeItem: disabledSessionMethod,
  };
}
