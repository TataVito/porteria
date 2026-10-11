# Portería Las Palmas — control de acceso del Condominio Las Palmas

Control de acceso, visitas, estacionamientos, encomiendas, lista negra y bitácora de conserjería. React + Vite, datos y login en Supabase (con cambios en vivo).

Son **dos apps con la misma base**:

- **Portería** (`/`): la opera el conserje (y la administración). Valida los pases QR, registra entradas y salidas, estacionamientos, encomiendas y bitácora.
- **Mi Casa** (`/casa/`): la usa cada casa en su celular. Entra con su **número de casa** y su clave (usuario interno `casa33`), crea las invitaciones con **pase QR**, y ve en vivo quién llegó y sus encomiendas. **Solo la casa puede crear invitaciones** (lo impone la base).

## Quién hace qué

| Rol | Qué ve y hace |
|---|---|
| **Casa** (residente) | En la app Mi Casa, su casa: crea invitaciones con **pase QR** (una vez o frecuentes, ej. nana), las comparte por WhatsApp, las anula; ve en vivo quién llegó y sus encomiendas. |
| **Conserje** | Portería de sus condominios: un solo buscador (código, patente, RUT, nombre o depto), **escáner QR con la cámara**, registro de entradas/salidas, mapa de estacionamientos de visita con alerta de tiempo excedido, encomiendas (recibir/entregar), bitácora de turno, teléfonos de cada depto. |
| **Administrador** | Lo anterior + panel, historial con Excel, unidades/residentes/vehículos (carga por rango o Excel), estacionamientos, lista negra, usuarios (incluye crear cuentas para todos los deptos de una vez), auditoría, datos del condominio. Solo sus condominios. |
| **Súper usuario** | Todo, en todos los condominios; único que crea/elimina condominios y crea administradores. |

## Seguridad

- **Los permisos los impone la base** (RLS de Postgres), no la pantalla: aunque alguien use la API directamente, un residente solo ve su depto y un conserje solo su condominio.
- **Entradas solo vía `registrar_entrada`**: revisa la lista negra (bloquea; solo un admin puede forzar y queda anotado), valida y consume la invitación (una vez = se usa una vez; frecuente = una entrada por día) y no deja ocupar un estacionamiento ya ocupado.
- **Códigos de invitación** generados por la base (6 caracteres sin ambiguos, aleatorio seguro). El residente no puede reactivar una invitación usada ni alterar sus usos.
- **Marcas no falsificables**: quién registró la entrada/salida/encomienda, las horas y el autor de cada invitación los pone la base.
- **Bitácora** de solo agregar (no se edita ni borra) y **auditoría inmutable** de todo cambio (solo administración la lee).
- Registro público desactivado: solo un admin crea usuarios, vía la Edge Function `admin-usuarios` (la única con la service role key).
- Usuario + clave (internamente `<usuario>@porteria-rvc.invalid`), mínimo 8 caracteres; cierre por inactividad (conserje 12 h, admin 8 h); al salir se borran los datos guardados en el equipo.
- Página publicada con CSP: solo ejecuta código propio y solo se conecta con Supabase.

Las reglas se prueban sin nube con `npm run test:db` (ejecuta la migración real en un Postgres embebido: 81 pruebas).

## Puesta en marcha (una sola vez)

1. **Crear proyecto** en https://supabase.com (región São Paulo).
2. **SQL Editor** → pegar y ejecutar `supabase/migrations/20261010000000_esquema_inicial.sql` (se puede ejecutar más de una vez).
3. **Authentication → Sign In / Providers**: desactivar **Allow new users to sign up**; en Email desactivar **Confirm email**; largo mínimo de clave 8.
4. **Edge Function**: Edge Functions → Deploy a new function → Via Editor, nombre `admin-usuarios`, pegar `supabase/functions/admin-usuarios/index.ts`.
5. **Primer súper usuario**: Authentication → Users → Add user → email `victor@porteria-rvc.invalid`, clave, *Auto Confirm User*. Luego en SQL Editor:
   ```sql
   update public.perfiles set rol = 'superusuario' where usuario = 'victor';
   ```
6. **Configurar la app**: copiar `.env.example` a `.env.local` con la URL y la anon/publishable key (Project Settings → API).
7. Entrar, crear el condominio (Condominio → Crear), cargar casas (Casas → Crear varias / Importar Excel), estacionamientos, y crear conserjes y las cuentas de las casas (Usuarios → «Cuentas para N casas sin cuenta»: descarga un Excel con la clave de cada casa).

## Desarrollo

```
npm install
npm run dev        # http://localhost:5173
npm run test:db    # pruebas de permisos de la base
npm run build
```
