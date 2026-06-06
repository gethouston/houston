# Centinela + WhatsApp: aprobacion humana de los STEP_UP

Cuando el gate devuelve `STEP_UP`, Centinela te manda un WhatsApp
("El agente {{1}} quiere solicitar permiso para {{2}}. Responde SI o NO.") y
espera tu respuesta. `SI` ejecuta la accion, `NO` o el timeout la bloquean.

Todo lo sensible se lee de variables de entorno: ningun secreto vive en un
archivo. Tu corres el envio, el token nunca sale de tu maquina.

## Dos numeros distintos (importante)

- **El que ENVIA**: un numero de PRUEBA que Meta te presta gratis. No usas el
  tuyo (no se puede). De este sale el `WHATSAPP_PHONE_NUMBER_ID`.
- **El que RECIBE** (el que vibra): tu numero PERSONAL de WhatsApp. Solo lo
  registras como destinatario de prueba. Ese es `WHATSAPP_RECIPIENT`.

No necesitas un segundo numero. Tu WhatsApp normal se queda igual.

## 1. Credenciales (Meta - WhatsApp Cloud API)

En developers.facebook.com -> tu app -> WhatsApp -> API Setup:

- **Access token** (el temporal sirve para hoy).
- **Phone number ID** (el numero emisor de prueba).
- Agrega **tu numero** en "To" y verificalo con el codigo que te llega.
- Desde tu celular, manda un "hola" al numero de prueba para abrir la ventana
  de 24h (asi podemos mandarte texto libre).

## 1b. La plantilla (si tu numero solo manda plantillas)

Un numero de negocio fuera de la ventana de 24h solo puede iniciar con una
**plantilla aprobada**. En WhatsApp Manager -> Manage templates -> Create:

- **Category**: Utility (aprueba rapido, sin limites de marketing).
- **Name**: `solicitud_permiso` (minusculas y guion bajo).
- **Language**: Spanish; anota el codigo exacto (ej. `es`).
- **Body** (dos variables, {{1}}=agente, {{2}}=permiso):

  `El agente {{1}} quiere solicitar permiso para {{2}}. Quieres aprobarla? Responde solo SI o NO.`

- **Ejemplos** que pide Meta: {{1}} = `asistente-seguro`, {{2}} = `enviar un correo`.

Submit y espera la aprobacion (Utility suele ser minutos).

## 2. Exporta el entorno (en TU terminal)

```sh
export WHATSAPP_TOKEN="EAAG..."             # del dashboard
export WHATSAPP_PHONE_NUMBER_ID="1234567890"
export WHATSAPP_RECIPIENT="573001234567"    # tu numero, con codigo de pais, sin + ni espacios
export WHATSAPP_TEMPLATE="solicitud_permiso" # nombre de tu plantilla aprobada
export WHATSAPP_TEMPLATE_LANG="es"           # el idioma EXACTO de la plantilla
export WHATSAPP_OTP_TEMPLATE="codigo_verificacion" # plantilla del OTP (1 var = el codigo); opcional
export WHATSAPP_ALERT_TEMPLATE="alerta_seguridad"  # plantilla de alerta del Auditor (3 vars: agente, permiso, razon); opcional
export WHATSAPP_VERIFY_TOKEN="centinela"     # lo eliges tu; va igual en Meta
export CENTINELA_LOG="$PWD/engine/houston-centinela-mcp/ui/decisions.jsonl"
```

> Si tu numero esta dentro de la ventana de 24h (le mandaste "hola"), puedes
> omitir `WHATSAPP_TEMPLATE` y manda texto libre. Para tu numero de plantillas,
> deja `WHATSAPP_TEMPLATE` configurado.

## 3. Tunel para el webhook (URL publica para que Meta te mande el SI/NO)

```sh
cloudflared tunnel --url http://localhost:8787
```

Copia el `https://....trycloudflare.com` que imprime.

## 4. Configura el webhook en Meta (una vez)

En tu app -> WhatsApp -> Configuration -> Webhook:

- **Callback URL**: `https://....trycloudflare.com/webhook`
- **Verify token**: el mismo de `WHATSAPP_VERIFY_TOKEN` (ej. `centinela`)
- Suscribe el campo **messages**.

El gateway debe estar corriendo (paso 5) para que la verificacion pase.

## 5. Corre el gateway y dispara un STEP_UP

```sh
cargo build -p houston-centinela-mcp
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_email","arguments":{"to":"noreply@api.santoria.app","subject":"hola","body":"prueba"}}}' \
  | ./target/debug/houston-centinela-mcp
```

Tu telefono vibra con la pregunta. Respondes `SI` -> el gateway imprime el
resultado ejecutado. Respondes `NO` (o no respondes en 120s) -> bloqueado.
Cada paso aparece en vivo en la Salvoconducto UI (http://localhost:8848).

Si el reply por chat falla en el escenario, el mensaje tambien funciona con los
links `https://....trycloudflare.com/approve` y `/deny`.

## 6. Verificacion del numero (root of trust)

El numero que recibe las aprobaciones es el ancla de confianza: si cualquiera
pudiera poner cualquier numero, el canal seria bypassable. Por eso un numero
solo se acepta tras verificar un codigo enviado a el.

- `WHATSAPP_RECIPIENT` siembra el numero (operador de confianza, fuera de banda).
- La Salvoconducto UI (panel "Tu numero de aprobaciones") permite al usuario
  enrolar su numero: escribe el numero, recibe un codigo por WhatsApp, lo
  confirma, y recien ahi queda verificado. Endpoints: `POST /enroll/start`
  (envia el codigo via `WHATSAPP_OTP_TEMPLATE` o texto libre en la ventana 24h)
  y `POST /enroll/confirm`.
- El agente nunca puede cambiarlo: el ancla vive server-side, fuera de su
  alcance. Sin numero verificado, los step-up se bloquean (fail-closed).

La plantilla OTP es una Utility con UNA variable, ej:
`Tu codigo de verificacion de Centinela es {{1}}. No lo compartas.`
