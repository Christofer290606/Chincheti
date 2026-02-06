import cron from 'node-cron';
import { generarIncidenciasNoRecogido } from '../controllers/cronController.js';

export const iniciarCronJobs = () => {
    // RQF30: Barrido diario a las 3:00 PM (15:00)
    // Sintaxis: minuto hora dia mes dia_semana
    cron.schedule('* * * * *', () => {
        generarIncidenciasNoRecogido();
    }, {
        scheduled: true,
        timezone: "America/Mexico_City"
    });

    console.log("🕒 Servicio Cron Activo: Barrido programado a las 15:00 hrs.");
};