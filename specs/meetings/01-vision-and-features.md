# Houston Meetings — Visión y Features

> **Documento 1 de 3.** Define QUÉ construimos y POR QUÉ. El diseño técnico
> está en `02-architecture-and-design.md`. El plan de ejecución por fases en
> `03-implementation-plan.md`.

---

## 1. La idea en una frase

Houston gana la capacidad de **entrar a una reunión de Google Meet como un
participante real**: escucha lo que se dice, responde con voz cuando le
hablan, toma notas, y al terminar convierte la reunión en misiones del board
y memoria persistente del agente.

Inspirado en OpenHuman (`C:\Users\galdi\Desktop\Proyects\openhuman`), que ya
resolvió este problema. Reusamos su enfoque técnico (scraping de captions +
monkey-patch de `getUserMedia`) adaptado a la arquitectura de Houston.

---

## 2. Por qué importa

El usuario objetivo de Houston es un founder NO técnico. Hoy Houston puede
leer su Gmail, su calendario, su CRM. Lo que NO puede hacer es estar presente
donde más se decide: **las reuniones**.

Con esta feature, Houston:

- **Te reemplaza parcialmente** en reuniones donde solo necesitas presencia
  informativa (standups, syncs de status, Q&A de soporte).
- **Te asiste en vivo** en reuniones donde sí estás, dándote datos del CRM o
  el calendario sin que sueltes el hilo de la conversación.
- **Nunca olvida**. Cada reunión se vuelve memoria del agente: la próxima vez
  que hables con la misma persona, Houston ya sabe qué acordaron.

---

## 3. Las dos capacidades clave

### 3.1 ESCUCHAR (listen path)

Houston abre un webview a `meet.google.com/<id>`, activa los captions nativos
de Google automáticamente, y lee el texto del DOM. **No usamos micrófono ni
STT propio** — Google ya transcribe a todos, nosotros leemos esa transcripción.

Resultado: transcript en vivo, atribuido por hablante, sin permisos de audio.

### 3.2 HABLAR (speak path)

Houston genera texto con el agente (Claude), lo convierte a audio con un
servicio TTS, y lo inyecta al stream de micrófono de Meet vía un monkey-patch
de `navigator.mediaDevices.getUserMedia`. Meet cree que es un micrófono real;
todos en la call escuchan al agente.

Resultado: el agente puede responder por voz a la reunión.

> **Decisión de scope:** la fase 1 implementa ESCUCHAR completo + el
> post-procesamiento (misiones + memoria). HABLAR se implementa en fase 2
> sobre la misma sesión. Ver `03-implementation-plan.md`.

---

## 4. Contexto pre-cargado: cómo "te reemplaza"

Antes de entrar, el usuario le da contexto al agente. Ese contexto + la
memoria del agente (learnings) + las integraciones (Composio) definen cómo se
comporta el agente en la call.

Ejemplo real:

```
Usuario → Houston:
  Reunión: meet.google.com/abc-def-ghi
  Bot entra como: "Houston (Antonio)"
  Agente: Sales
  Contexto: Reunión de ventas con Carlos de Acme. Quiere 20% de descuento.
            Mi límite real es 10%. No comprometas fechas de entrega sin mí.

Houston entra a la call con:
  - Ese contexto de la reunión
  - Learnings previos del agente Sales (reuniones pasadas con Carlos)
  - Acceso a Composio (CRM, calendario, email) durante la call

Carlos: "Houston, ¿pueden dar 15%?"
Houston (voz): "El precio actual ya incluye soporte premium. Puedo ofrecer
                10% si cerramos antes del viernes."
```

---

## 5. La página Meetings

Una página nueva en el sidebar, al mismo nivel que **Dashboard** y
**Connections** (NO es un tab dentro de un agente — es global del workspace).

```
SIDEBAR
> Dashboard          (existe)
> Connections        (existe)
> Meetings    📹     ← NUEVO
> Settings           (existe)
──────────────
  Your AI Agents
  > Sales
  > Operations
  + New Agent
```

### Layout de la página (board de 3 columnas)

```
┌──────────────────────────────────────────────────────────────────┐
│  Meetings                                    [+ Nueva reunión]    │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  PRÓXIMAS    │  │  EN VIVO  🔴 │  │      COMPLETADAS         │ │
│  │──────────────│  │──────────────│  │──────────────────────────│ │
│  │ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌────────┐ ┌────────┐    │ │
│  │ │📅 Sync   │ │  │ │🔴 Board  │ │  │ │✅ 1:1  │ │✅ Demo │    │ │
│  │ │ Hoy 3PM  │ │  │ │ Review   │ │  │ │ Carlos │ │  Prep  │    │ │
│  │ │ 4 personas│ │  │ │ EN VIVO  │ │  │ │ Jun 5  │ │ Jun 4  │    │ │
│  │ │[Entrar →]│ │  │ │ 14 min   │ │  │ │3 tareas│ │5 tareas│    │ │
│  │ └──────────┘ │  │ │[Salir]   │ │  │ │1 email │ │2 emails│    │ │
│  │              │  │ └──────────┘ │  │ └────────┘ └────────┘    │ │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Panel de detalle (clic en una tarjeta completada)

```
┌─────────────────────────────────┐
│  Board Review — Jun 5           │
│  14 min · Alice, Bob, Carlos    │
├─────────────────────────────────┤
│  Resumen                        │
│  "Se decidió lanzar v2 antes…"  │
├─────────────────────────────────┤
│  Tareas creadas → Board         │
│  ✅ Actualizar roadmap          │
│  ✅ Agendar follow-up           │
│  ✅ Compartir deck a inversores │
├─────────────────────────────────┤
│  Borradores de email            │
│  → Carlos: "Gracias por…"       │
├─────────────────────────────────┤
│  Transcript completo            │
│  Alice: "Lancemos v2…"          │
│  Bob: "De acuerdo, el plazo…"   │
└─────────────────────────────────┘
```

---

## 6. Estados de una reunión

Una reunión (`Meeting`) tiene exactamente estos estados:

| Estado       | Significado                                              | Columna       |
|--------------|---------------------------------------------------------|---------------|
| `upcoming`   | Programada (manual o detectada del calendario). No ha empezado. | Próximas      |
| `live`       | Houston está dentro del Meet ahora mismo, capturando.   | En vivo       |
| `processing` | Houston salió; el agente está generando resumen+tareas. | En vivo (spinner) |
| `completed`  | Resumen listo, tareas creadas, memoria actualizada.     | Completadas   |
| `error`      | Algo falló (no pudo unirse, sesión cayó).               | Completadas (rojo) |

Transiciones válidas:
```
upcoming → live → processing → completed
upcoming → live → error
live → error
```

---

## 7. User stories (criterios de aceptación)

### US-1 — Unirse a una reunión
**Como** usuario, **quiero** pegar un link de Meet, elegir un agente y darle
contexto, **para que** Houston entre a la reunión por mí.
- [ ] Hay un botón "Nueva reunión" en la página Meetings.
- [ ] El formulario pide: URL de Meet, nombre del bot, agente, contexto (textarea opcional).
- [ ] Valida que la URL sea `https://meet.google.com/...`.
- [ ] Al confirmar, se crea una `Meeting` en estado `live` y aparece una
      ventana de Meet (puede estar off-screen u oculta — ver decisión en doc 2).
- [ ] El bot aparece en la lista de participantes de Meet con el nombre dado.

### US-2 — Captura en vivo
**Como** usuario, **quiero** ver que Houston está capturando la reunión,
**para** confiar en que está funcionando.
- [ ] La tarjeta de la reunión en vivo muestra un indicador pulsante 🔴.
- [ ] Muestra el contador de minutos y de líneas de transcript capturadas.
- [ ] El transcript se va guardando en disco mientras la reunión corre.

### US-3 — El agente habla (fase 2)
**Como** usuario, **quiero** que Houston responda por voz cuando le hablan en
la reunión, **para que** pueda representarme.
- [ ] Cuando un participante dice el nombre del bot (wake-word), el agente
      genera una respuesta.
- [ ] La respuesta se sintetiza a voz y se escucha en la reunión.
- [ ] El agente NO responde a su propio eco (filtro self-echo).
- [ ] Gate de privacidad: por defecto solo el dueño puede activar acciones con
      herramientas (Composio); otros participantes obtienen respuestas informativas.

### US-4 — Salir y procesar
**Como** usuario, **quiero** que al terminar la reunión Houston me deje las
tareas y un resumen, **para** no tener que tomar notas.
- [ ] Hay un botón "Salir" en la tarjeta en vivo.
- [ ] Al salir, la reunión pasa a `processing` y luego a `completed`.
- [ ] El agente genera un resumen de la reunión.
- [ ] El agente crea una misión en el board del agente por cada action item.
- [ ] El agente guarda decisiones clave en los learnings del agente.
- [ ] (Opcional) El agente redacta borradores de email de follow-up.

### US-5 — Memoria entre reuniones
**Como** usuario, **quiero** que Houston recuerde reuniones pasadas, **para
que** cada conversación tenga continuidad.
- [ ] En una reunión nueva con la misma persona, el contexto incluye learnings
      de reuniones previas.

### US-6 — Historial de reuniones
**Como** usuario, **quiero** ver todas mis reuniones pasadas, **para**
revisarlas cuando quiera.
- [ ] La columna "Completadas" lista todas las reuniones pasadas, más recientes primero.
- [ ] Clic en una abre el panel con resumen, tareas, emails y transcript.

---

## 8. Fuera de scope (explícito)

- **No** transcribimos con STT propio. Usamos los captions de Google.
- **No** grabamos audio ni video. Solo texto (captions) y, en fase 2, audio
  TTS efímero de salida.
- **No** soportamos Zoom / Teams en v1. Solo Google Meet.
- **No** hay auto-join programado por calendario en v1 (la `Meeting` puede
  existir como `upcoming` pero el usuario aprieta "Entrar"). El auto-join es
  roadmap.

---

## 9. Privacidad y seguridad (no negociable)

- El webview de Meet usa un **data directory aislado** por reunión, así el
  bot entra como invitado anónimo sin filtrar cookies de otras sesiones de Google.
- El gate de privacidad **falla cerrado**: si no hay dueño configurado, el bot
  NO actúa con herramientas para nadie.
- El bot nunca se activa con su propio eco de captions.
- Los transcripts viven en local, en `.houston/` del agente, como cualquier
  otro dato. Reusan toda la reactividad de Houston (file watcher + eventos).

---

## 10. Decisiones que el implementador debe respetar

1. **La página Meetings es global del workspace**, no un tab de agente. Vive
   junto a Dashboard/Connections en el sidebar y en `viewMode`.
2. **Una `Meeting` pertenece a un agente** (`agent_path`). El procesamiento
   (resumen, tareas, memoria) usa ese agente. La página global lista las
   reuniones de todos los agentes del workspace.
3. **Reusar componentes existentes** antes de crear nuevos. El board de 3
   columnas debería apoyarse en `@houston-ai/board` (`KanbanItem`,
   `KanbanColumn`) si encaja; si no, un grid simple de cards está bien.
4. **Cero silent failures.** Todo error que el usuario provocó (no pudo unirse,
   TTS falló) llega como toast con "Report bug". Ver la política en `CLAUDE.md`.
5. **i18n desde el día 1.** en / es / pt. Nada de inglés hardcodeado en JSX.
</content>
</invoke>
