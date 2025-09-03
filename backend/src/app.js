// src/app.js
const db = require("./config/db");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Ruta de prueba
app.get("/test-db", (req, res) => {
  db.query("SELECT NOW() as fecha", (err, result) => {
    if (err) {
      return res.status(500).json({ error: "Error al consultar la BD" });
    }
    res.json({ mensaje: " Conectado a la BD", fecha: result[0].fecha });
  });
});

app.listen(PORT, () => {
  console.log(` Servidor escuchando en http://localhost:${PORT}`);
});
