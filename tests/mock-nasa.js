global.fetch = async (url) => {
  const params = new URL(url).searchParams;
  if (params.get("api_key") !== "test-key") {
    throw new Error("Unexpected test key");
  }
  if (params.get("date") === "2000-01-03") {
    throw new Error("Simulated network failure");
  }
  const rateLimited = params.get("date") === "2000-01-02";
  return {
    ok: !rateLimited,
    status: rateLimited ? 429 : 200,
    async text() {
      return rateLimited ? "Rate limit exceeded" : JSON.stringify({ date: params.get("date") });
    },
  };
};
