// client/cli/create-admin.js

const { connectDB } = require('../../database/db.js');
const User = require('../../database/models/user.model');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

/**
 * Función principal para crear un usuario administrador.
 */
async function createAdmin() {
    console.log('--- Creación de Usuario Administrador ---');
    const inquirer = (await import('inquirer')).default;

    try {
        // 1. Conectarse a la base de datos
        await connectDB();

        // 2. Pedir los datos del administrador
        const adminData = await inquirer.prompt([
            {
                type: 'input',
                name: 'correo',
                message: 'Introduce el correo electrónico para el nuevo administrador:',
                validate: (value) => value.includes('@') ? true : 'Por favor, introduce un correo válido.'
            },
            {
                type: 'password',
                name: 'password',
                message: 'Introduce la contraseña (mínimo 6 caracteres):',
                mask: '*',
                validate: (value) => value.length >= 6 ? true : 'La contraseña es demasiado corta.'
            }
        ]);

        // 3. Verificar si el usuario ya existe
        const usuarioExistente = await User.findOne({ correo: adminData.correo.toLowerCase() });
        if (usuarioExistente) {
            throw new Error(`El correo '${adminData.correo}' ya está en uso.`);
        }

        // 4. Hashear la contraseña
        console.log('Hasheando contraseña...');
        const hash_password = await bcrypt.hash(adminData.password, SALT_ROUNDS);

        // 5. Crear el nuevo usuario con el rol forzado a 'admin'
        const newAdmin = new User({
            correo: adminData.correo.toLowerCase(),
            hash_password: hash_password,
            rol: 'admin' // ¡La parte más importante!
        });

        // 6. Guardar directamente en la base de datos
        await newAdmin.save();

        console.log('\n✅ ¡Éxito! Usuario administrador creado correctamente.');
        console.log(`   Correo: ${newAdmin.correo}`);
        console.log(`   Rol: ${newAdmin.rol}`);

    } catch (error) {
        console.error('\n❌ Error al crear el administrador:', error.message);
    } finally {
        // 7. Cerrar la conexión a la base de datos
        const mongoose = require('mongoose');
        await mongoose.connection.close();
        console.log('Conexión a la base de datos cerrada.');
    }
}

createAdmin();