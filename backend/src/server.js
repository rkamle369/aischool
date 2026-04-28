import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import chatRoutes from "./routes/chatRoutes.js";
import coursesRoutes from "./routes/coursesRoutes.js";
import livekitRoutes from "./routes/livekitRoutes.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

const defaultAllowedOrigins = ["http://localhost:5173", "http://localhost:5174"];
const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const corsAllowlist = allowedOrigins.length ? allowedOrigins : defaultAllowedOrigins;

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (no Origin header) and same-origin requests.
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, corsAllowlist.includes(origin));
    }
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
