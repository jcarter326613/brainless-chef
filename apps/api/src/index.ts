import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 8080);

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on port ${port}`);
});
