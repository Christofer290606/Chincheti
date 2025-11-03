// src/app.js
import usuariosRouter from './routes/usuarios.js';
import db from './config/db.js';
import materialesRouter from './routes/materiales.js';
import valesRouter from './routes/vales.js';
import gestionRouter from './routes/gestionAlmacen.js';
import estadisticasRouter from './routes/estadisticas.js';
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRouter from './routes/auth.js';
dotenv.config();

const app = express();
const PORT =  3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use('/api/usuarios', usuariosRouter);

app.use('/api/materiales', materialesRouter);
app.use('/api/auth', authRouter);
app.use('/api/vales', valesRouter);
app.use('/api/gestion', gestionRouter);
app.use('/api/estadisticas', estadisticasRouter);

// Ruta de prueba
app.get("/test-db", (req, res) => {
  db.query("SELECT NOW() as fecha", (err, result) => {
    if (err) {
      return res.status(500).json({ error: "No jala" });
    }
    res.json({ mensaje: "Si jala", fecha: result[0].fecha });
  });
});

app.listen(PORT, () => {
  console.log(` Servidor escuchando en http://localhost:${PORT}`);
});
