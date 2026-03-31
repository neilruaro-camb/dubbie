import { CambClient } from "@camb-ai/sdk";

const camb = new CambClient({
  apiKey: process.env.CAMB_API_KEY as string,
});

export default camb;
