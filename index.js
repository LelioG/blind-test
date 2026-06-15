const express = require("express");
const path = require("path");
const { PORT, HOST } = require("./src/config");
const { registerRoutes } = require("./src/routes");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(new Date().toISOString() + " " + req.method + " " + req.originalUrl);
  next();
});

const clientDistPath = path.join(__dirname, "client", "dist");

// Très important : servir les fichiers React AVANT le fallback
app.use(express.static(clientDistPath));

// Routes backend/API
registerRoutes(app);

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    message: "Backend OK",
  });
});

// Fallback React, mais seulement pour les vraies routes frontend
app.use((req, res) => {
  const hasExtension = path.extname(req.path);

  // Si le navigateur demande un fichier .js, .css, .png, etc.
  // et qu'il n'existe pas, on renvoie une vraie 404 au lieu de index.html.
  if (hasExtension) {
    return res.status(404).send("Fichier introuvable");
  }

  res.sendFile(path.join(clientDistPath, "index.html"));
});

const server = app.listen(PORT, HOST, () => {
  console.log("Serveur lancé");
  console.log("PORT :", PORT);
  console.log("HOST :", HOST);
  console.log("Dossier React servi :", clientDistPath);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error("Le port " + PORT + " est deja utilise. Arrete l'ancien serveur ou change de port.");
  } else {
    console.error("Impossible de lancer le serveur :", error.message);
  }

  process.exit(1);
});