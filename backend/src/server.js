import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import chatRoutes from "./routes/chatRoutes.js";
import coursesRoutes from "./routes/coursesRoutes.js";
import livekitRoutes from "./routes/livekitRoutes.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173"
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/courses", coursesRoutes);
app.use("/chat", chatRoutes);
app.use("/livekit", livekitRoutes);

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
