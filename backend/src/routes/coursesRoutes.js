import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const coursesPath = path.join(__dirname, "../data/courses.json");

router.get("/", (_req, res) => {
  const file = fs.readFileSync(coursesPath, "utf-8");
  const coursesData = JSON.parse(file);
  res.json(coursesData);
});

export default router;
