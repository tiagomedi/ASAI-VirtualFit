/* ---------------- PERFIL SERVICE (multi-registro por correo) ---------- */
const net = require('net');
const { connectDB } = require('../../database/db');
connectDB();                   // conexión central
const User = require('../../database/models/user.model');

const BUS_HOST = process.env.BUS_HOST || 'localhost';
const BUS_PORT = Number(process.env.BUS_PORT) || 5001;

/* ---- Helper para armar tramas con longitud en bytes ------------------ */
const frame = (svc, status, body = '') => {
  const payload = `${svc}${status}${body}`;
  return (
    String(Buffer.byteLength(payload, 'utf8')).padStart(5, '0') + payload
  );
};

/* ---------------- Lógica por operación (correo) ----------------------- */
async function handleMessage(svc, data) {
  switch (svc) {
    case 'prfl1': {                               // ➜ Ver perfil
      const correo = data.trim().toLowerCase();
      const user = await User.findOne({ correo }).lean();
      if (!user) throw new Error('Usuario no encontrado');
      return JSON.stringify(user);
    }

    case 'prfl2': {                               // ➜ Agregar dirección
      const [correoRaw, json] = data.split('|');
      const correo = correoRaw.trim().toLowerCase();
      const user = await User.findOne({ correo });
      if (!user) throw new Error('Usuario no encontrado');
      user.direcciones.push(JSON.parse(json));
      await user.save();
      return 'Dirección añadida con éxito';
    }

    case 'prfl3': {                               // ➜ Agregar método de pago
      const [correoRaw, json] = data.split('|');
      const correo = correoRaw.trim().toLowerCase();
      const user = await User.findOne({ correo });
      if (!user) throw new Error('Usuario no encontrado');
      user.metodos_pago.push(JSON.parse(json));
      await user.save();
      return 'Método de pago añadido con éxito';
    }

    default:
      throw new Error('Comando no reconocido');
  }
}

/* -------- Crea una conexión y registra un código de servicio ---------- */
function registerService(code) {
  const sock = new net.Socket();

  sock.connect(BUS_PORT, BUS_HOST, () => {
    const sinit = `sinit${code}`;
    sock.write(String(sinit.length).padStart(5, '0') + sinit);
    console.log(`[PerfilService] ✅ Registrado código '${code}'`);
  });

  sock.on('data', async (buf) => {
    const total   = buf.readUIntBE(0, 5);               // primera parte
    const payload = buf.slice(5, 5 + total).toString();
    const svc     = payload.slice(0, 5);
    const datos   = payload.slice(5);

    let status = 'OK', body = '';
    try   { body = await handleMessage(svc, datos); }
    catch (e) { status = 'NK'; body = e.message;   }

    sock.write(frame(svc, status, body));
  });

  sock.on('error',  e => console.error(`[PerfilService:${code}] ❌`, e.message));
  sock.on('close', () => console.log(`[PerfilService:${code}] 🔌 cerrado`));
}

['prfl1', 'prfl2', 'prfl3'].forEach(registerService);

