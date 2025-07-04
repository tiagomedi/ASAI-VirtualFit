/* ------------------------  CLIENTE CLI  ------------------------------- */
const net      = require('net');
const inquirer = require('inquirer').default;
const chalk    = require('chalk');

const BUS_HOST = 'localhost';
const BUS_PORT = 5001;
const sock     = new net.Socket();
let   buffer   = Buffer.alloc(0);

console.log(chalk.blue(`Conectando al bus en ${BUS_HOST}:${BUS_PORT}…`));
sock.connect(BUS_PORT, BUS_HOST, () =>
  console.log(chalk.green('✅ Conectado al bus como cliente CLI'))
);

/* ---------------------  Utilidad de envío  ---------------------------- */
function enviar(codigo, datos) {
  const cuerpo = codigo + datos;
  const msg    = Buffer.from(
    String(Buffer.byteLength(cuerpo, 'utf8')).padStart(5, '0') + cuerpo,
    'utf8'
  );
  sock.write(msg);
}

/* ---------------------  Respuestas del BUS  --------------------------- */
sock.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  while (buffer.length >= 5) {
    const len = parseInt(buffer.slice(0, 5).toString(), 10);
    if (buffer.length < len + 5) break;

    const payloadBuf = buffer.slice(5, 5 + len);
    buffer           = buffer.slice(5 + len);

    const servicio  = payloadBuf.slice(0, 5).toString();
    const estado    = payloadBuf.slice(5, 7).toString();
    const respuesta = payloadBuf.slice(7).toString();

    console.log(
      chalk.yellow(
        `\n📩 Respuesta del servicio ${servicio} [${estado}]:\n${respuesta}`
      )
    );
    mostrarMenu();
  }
});

sock.on('close', () => console.log(chalk.red('❌ BUS desconectado')));

/* ----------------------  Menú interactivo  ---------------------------- */
function mostrarMenu() {
  inquirer
    .prompt({
      type: 'list',
      name: 'op',
      message: 'Selecciona una opción:',
      choices: [
        { name: 'Ver perfil',             value: 'ver'  },
        { name: 'Agregar dirección',      value: 'dir'  },
        { name: 'Agregar método de pago', value: 'pago' },
        { name: 'Salir',                  value: 'bye'  }
      ]
    })
    .then(({ op }) => {
      if (op === 'bye') { sock.end(); return; }

      const preguntas = [{ name: 'correo', message: 'Correo del usuario:' }];

      if (op === 'dir')
        preguntas.push(
          { name: 'nombre_direccion', message: 'Nombre dirección:' },
          { name: 'calle',            message: 'Calle:'            },
          { name: 'ciudad',           message: 'Ciudad:'           },
          { name: 'region',           message: 'Región:'           },
          { name: 'codigo_postal',    message: 'Código postal:'    }
        );

        if (op === 'pago')
        preguntas.push(
          { 
            type: 'list',
            name: 'tipo',
            message: 'Tipo de método de pago:',
            choices: ['Visa', 'Tarjeta de Crédito', 'PayPal', 'Otro']
          },
          { name: 'detalle',    message: 'Detalle:'          },
          { name: 'expiracion', message: 'Expiración MM/YY:' }
        );
      
      inquirer.prompt(preguntas).then(({ correo, ...resto }) => {
        const email = correo.trim().toLowerCase();
        if (op === 'ver')  return enviar('prfl1', email);
        if (op === 'dir')  return enviar('prfl2', `${email}|${JSON.stringify(resto)}`);
        if (op === 'pago') return enviar('prfl3', `${email}|${JSON.stringify(resto)}`);
      });
    });
}

sock.once('connect', mostrarMenu);
