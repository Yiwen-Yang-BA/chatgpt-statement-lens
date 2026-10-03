import { createApp } from "./lib/server.mjs";
import { run } from "./project.mjs";
import { fileURLToPath } from "node:url";
const server = createApp({
  project: {
    id: "chatgpt-statement-lens",
    title: "Statement Lens",
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
  run,
});
const port = Number(process.env.PORT || 3210);
server.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(
    "Statement Lens" +
      " → http://" +
      (process.env.HOST || "127.0.0.1") +
      ":" +
      port,
  ),
);
