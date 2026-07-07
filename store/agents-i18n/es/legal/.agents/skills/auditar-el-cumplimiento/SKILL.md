---
name: auditar-el-cumplimiento
title: "Auditar el cumplimiento"
description: "Verifica que tu cumplimiento legal siga en buena forma. Elige qué revisar: tu política de privacidad, tu lista de proveedores de privacidad o tus plantillas de contrato. Te muestro qué se ha desactualizado o quedó desalineado y qué corregir. Nunca cambio nada por mi cuenta."
version: 1
category: Cumplimiento
featured: yes
image: scroll
integrations: [googledocs, googledrive, stripe, firecrawl]
---


# Auditar el cumplimiento

Una sola skill para todas las verificaciones de estado del cumplimiento. El parámetro `scope` elige qué inventario recorrer. Comparte la disciplina de "diferencias, no arreglos" y "cada hallazgo cita una autoridad".

## Parámetro: `scope`

- `privacy-posture`, rastrea la landing page y el producto con Firecrawl, contrasta contra la Política de Privacidad publicada, y señala desalineaciones (una herramienta de analítica nueva sin divulgar, un subprocesador agregado sin actualizar la política, una cookie nueva, un cambio de propósito) con severidad y la actualización recomendada. Escribe en `privacy-audits/{YYYY-MM-DD}.md`.
- `subprocessors`, recorre las integraciones conectadas y los proveedores inferidos del rastreo de la landing page, capturando rol, categorías de datos, mecanismo de transferencia, estatus del DPA y URL pública del DPA. Lee, combina y escribe `subprocessor-inventory.json` en la raíz del agente + un reporte de una página con las diferencias en `subprocessor-reviews/{YYYY-MM-DD}.md`.
- `template-library`, lee `domains.contracts.templateLibrary`, señala plantillas con más de 12 meses de antigüedad, y las contrasta contra las referencias legales vigentes (divulgación de entrenamiento con IA, versiones de las SCC, estándares 2026 de DPA, ampliaciones de derechos en CA/UE). Escribe un plan de actualización en `template-reviews/{YYYY-MM-DD}.md`. Nunca reescribe automáticamente, el fundador aprueba cada una y activa `draft-a-legal-document` para la reescritura.

Si el usuario nombra el scope en lenguaje simple ("audita mi privacidad", "actualiza las plantillas", "actualiza la lista de subprocesadores") → infiérelo. Ambiguo → haz UNA pregunta nombrando las 3 opciones.

## Cuándo usar

- Explícito: "audita mi postura de privacidad", "actualiza mi lista de subprocesadores", "actualiza mi biblioteca de plantillas", "qué se desalineó", "qué está desactualizado".
- Las preguntas en lenguaje simple mapean a un `scope`: "¿mi política de privacidad sigue vigente?" / "¿mi política de privacidad coincide con lo que realmente hacemos?" → `privacy-posture`; "actualiza mi lista de proveedores de privacidad" / "¿agregamos herramientas nuevas que tocan datos de clientes?" → `subprocessors`; "¿mis plantillas de contrato siguen vigentes?" / "¿hay alguna plantilla con más de un año que deba actualizar?" → `template-library`.
- Implícito: cadencia mensual programada (privacy-posture, subprocessors); se agregó un proveedor nuevo (subprocessors); se lanza una nueva superficie de landing page (privacy-posture); la biblioteca de plantillas se referencia con más de 12 meses de antigüedad en cualquier otra skill (template-library).

## Campos del registro que leo

Primero leo `config/context-ledger.json`.

- `universal.legalContext` + `context/legal-context.md`, requerido. Da la instantánea de la entidad, la postura de riesgo, el stack de plantillas vigente (ancla para el scope template-library). Si falta → ejecuta primero la skill `set-up-my-legal-info` (o haz UNA pregunta puntual para avanzar).
- `universal.company.website`, requerido para `privacy-posture` y `subprocessors` (URL de la landing page para Firecrawl).
- `domains.compliance.landingPageUrl`, más específico que `universal.company.website` si difieren; si no, usa el website.
- `domains.compliance.deployedPolicies.privacyPolicyUrl`, requerido para `privacy-posture` (el documento contra el que se compara).
- `domains.compliance.dataGeography`, determina si aplican controles específicos de la UE para subprocesadores (SCC, mecanismo de transferencia).
- `domains.contracts.templateLibrary`, requerido para `template-library`.
- `subprocessor-inventory.json`, requerido para `subprocessors` (el inventario previo es la base para calcular la diferencia).

Si falta un campo requerido → haz UNA pregunta puntual con pista de modalidad (conectar Google Drive / pegar la URL de la landing page / conectar Firecrawl), escribe la respuesta, continúa.

## Pasos

1. **Lee el registro y el contexto legal.** Reúne los campos requeridos que falten. Escribe de forma atómica.
2. **Descubre las herramientas vía Composio.** Ejecuta `composio search web-scrape` (privacy-posture, subprocessors) o `composio search document-storage` (template-library) según el scope. Si no hay herramienta conectada, nombra la categoría a conectar y detente.
3. **Ramifica según `scope`.**
   - `privacy-posture`:
     1. Ejecuta el slug de web-scrape contra la URL de la landing page y las rutas clave del producto. Captura las etiquetas de analítica, las cookies que se sueltan, los formularios y campos, los widgets de terceros, y los scripts que revelan subprocesadores (Stripe, Intercom, Segment, HotJar, etc.).
     2. Trae la Política de Privacidad publicada (por la URL del registro o el mismo rastreo).
     3. Compara: herramientas observadas en el sitio que no están en la política, categorías de datos recolectadas sin divulgar, categorías de cookies nuevas, cambio de propósito (la descripción del producto cambió de forma relevante desde la última actualización de la política).
     4. Etiqueta cada hallazgo con severidad (`critical`, exposición regulatoria; `high`, riesgo de confianza del cliente; `medium`, mantenimiento; `low`, para tu información). Cita la autoridad en cada hallazgo `critical` (GDPR Art. 13/14, CCPA §1798.100, 16 CFR Parte 314 cuando aplique).
     5. Escribe `privacy-audits/{YYYY-MM-DD}.md`: resumen ejecutivo → diferencias por severidad → próximo paso recomendado por hallazgo (lo más común: encadenar a `draft-a-legal-document` type=privacy-policy).
   - `subprocessors`:
     1. Lee el `subprocessor-inventory.json` actual.
     2. Recorre las integraciones conectadas (vía las conexiones de Composio instaladas por el usuario), cada herramienta conectada que toca datos de clientes es un candidato a subprocesador.
     3. Rastrea la landing page en busca de pistas adicionales (Stripe, Intercom, Calendly, etc. vía scripts públicos).
     4. Por cada candidato captura: `role` (pagos / correo / analítica / soporte / hosting / IA / CRM / otro), `dataCategories` (identificadores / uso / contenido / pago / sensible), `transferMechanism` (SCC / UK IDTA / DPF / intra-UE / solo intra-EE. UU. / desconocido), `dpaStatus` (firmado estándar / firmado negociado / publicado / faltante / desconocido), `publicDpaUrl`.
     5. Lee, combina y escribe `subprocessor-inventory.json`. Diferencia contra el anterior = agregado / eliminado / cambiado / sin cambio.
     6. Escribe `subprocessor-reviews/{YYYY-MM-DD}.md`, una página con la diferencia, "proveedores nuevos que necesitan actualizar la política" arriba de todo + enlace a `audit-compliance` scope=privacy-posture como seguimiento.
   - `template-library`:
     1. Lee `domains.contracts.templateLibrary`. Por cada plantilla, revisa `lastUpdatedAt` (o los metadatos del archivo); señala cualquiera con más de 12 meses.
     2. Por cada plantilla desactualizada, enumera los cambios legales vigentes a considerar (divulgación de entrenamiento con IA para consultoría / MSA / documentos de cliente; revisión de versión SCC 2021 / 2025 para los DPA; estándares 2026 de DPA; lenguaje de periodo de subsanación de la CCPA; divulgaciones de la Ley de IA de la UE para funciones que tocan IA).
     3. Clasifica por exposición (documentos de clientes > documentos de proveedores > internos).
     4. Escribe `template-reviews/{YYYY-MM-DD}.md`, plan de actualización: (a) plantillas para actualizar ahora, (b) revisar el próximo trimestre, (c) siguen vigentes. Nunca reescribe automáticamente; recomienda encadenar `draft-a-legal-document` por cada plantilla.
4. **Agrega la entrada a `outputs.json`**, lee, combina y escribe de forma atómica: `{ id, type: "privacy-audit" | "subprocessor-review" | "template-review", title, summary, path, status: "ready", domain: "compliance", createdAt, updatedAt, attorneyReviewRequired? }`. Marca `attorneyReviewRequired: true` cuando un hallazgo `critical` implique exposición regulatoria.
5. **Resume para el usuario.** Un párrafo corto en lenguaje simple: los 2 hallazgos principales y el único próximo paso más útil (por ejemplo, "¿Quieres que redacte una política de privacidad actualizada que cierre estos huecos?"). Nunca menciones archivos, rutas o procedimientos internos.

## Lo que nunca hago

- Corregir nada automáticamente. La skill muestra diferencias y recomienda seguimientos; el fundador decide.
- Inventar un subprocesador, un flujo de datos o una cookie que no se haya observado en el rastreo o en una integración conectada. Dato faltante → DESCONOCIDO.
- Declarar que una política cumple con el GDPR. Puedo decir "la política divulga X, no divulga Y", nunca "estás cubierto."
- Usar nombres de herramientas fijos en el código, el descubrimiento con Composio es solo en tiempo de ejecución.
- Sobrescribir `subprocessor-inventory.json`, siempre leo, combino y escribo.
- Omitir la cita de autoridad en cualquier hallazgo `critical` de privacy-posture.

## Resultados

- `privacy-audits/{YYYY-MM-DD}.md` (scope=privacy-posture).
- `subprocessor-reviews/{YYYY-MM-DD}.md` + actualiza `subprocessor-inventory.json` (scope=subprocessors).
- `template-reviews/{YYYY-MM-DD}.md` (scope=template-library).
- Se agrega a `outputs.json`.
