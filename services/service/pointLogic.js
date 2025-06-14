const User = require('../../database/models/user.model');
async function agregarPuntos({ user_id, total_pago }) {
    console.log(`--- [pointLogic] Ejecutando lógica de negocio para usuario ${user_id} ---`);

    if (!user_id || total_pago === undefined) {
        throw new Error("Faltan 'user_id' o 'total_pago' en el payload.");
    }
    
    if (total_pago <= 0) {
        console.log(`[pointLogic] El total de pago (${total_pago}) no es suficiente para generar puntos. No se realizan cambios.`);
        return { message: "No se generaron nuevos puntos.", asai_points_actual: (await User.findById(user_id, 'asai_points')).asai_points };
    }

    const usuario = await User.findById(user_id);
    if (!usuario) {
        throw new Error(`Usuario con ID '${user_id}' no encontrado.`);
    }

    // Cálculo de puntos: 1 punto por cada 1000. Se usa Math.floor para descartar fracciones.
    const puntosGanados = Math.floor(total_pago / 1000);

    if (puntosGanados > 0) {
        const puntosAntes = usuario.asai_points;
        usuario.asai_points += puntosGanados;
        await usuario.save(); // La operación .save() es atómica a nivel de documento.
        
        console.log(`[pointLogic] Usuario ${user_id} ha ganado ${puntosGanados} puntos. Total anterior: ${puntosAntes}, Total nuevo: ${usuario.asai_points}.`);
        
        return {
            message: `¡Se han añadido ${puntosGanados} ASAIpoints con éxito!`,
            usuario_id: usuario._id,
            puntos_ganados: puntosGanados,
            asai_points_actual: usuario.asai_points
        };
    } else {
        console.log(`[pointLogic] El total de pago (${total_pago}) no fue suficiente para generar puntos.`);
        return {
            message: "El total de la compra no fue suficiente para generar nuevos puntos.",
            usuario_id: usuario._id,
            puntos_ganados: 0,
            asai_points_actual: usuario.asai_points
        };
    }
}

module.exports = { agregarPuntos };