import OpenAI from "openai";

let _client: OpenAI | null = null;

function getOpenRouter(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPEN_ROUTER_API_KEY || "not-configured",
    });
  }
  return _client;
}

export default new Proxy({} as OpenAI, {
  get(_, prop) {
    return (getOpenRouter() as any)[prop];
  },
});
