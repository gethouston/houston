# Houston kind POC

Entorno de desarrollo local completo en [kind](https://kind.sigs.k8s.io/) (Kubernetes in Docker). Levanta el stack completo — control plane, Postgres, frontend React y agentes como pods — en tu máquina sin necesidad de nada en la nube.

---

## Requisitos

| Herramienta | Instalación |
|---|---|
| Docker Desktop | https://www.docker.com/products/docker-desktop |
| kind | `brew install kind` |
| kubectl | `brew install kubectl` |
| pnpm | `brew install pnpm` |
| Node.js 22+ | `brew install node` |

---

## Levantar desde cero

```bash
# Desde la raíz del monorepo
export ANTHROPIC_API_KEY=sk-ant-...

make kind-up
```

Tarda ~5 min la primera vez (descarga imágenes base de Docker). Al final:

```
╔══════════════════════════════════════════════════╗
║  Houston is up  →  http://localhost:9080         ║
╚══════════════════════════════════════════════════╝
```

Abre http://localhost:9080. La app carga directamente con un dev token preconfigurado — sin login.

---

## Tras un cambio de código

```bash
make kind-update
```

Reconstruye las tres imágenes (engine-pod, control-plane, frontend), las carga en kind y reinicia los deployments.

Targets individuales si solo cambias una capa:

```bash
make build-engine-pod    # solo runtime de agentes
make build-control-plane # solo API / control plane
make build-frontend      # solo React + nginx
make kind-deploy         # solo aplica los YAMLs (sin rebuild)
```

---

## Comandos útiles

```bash
make kind-logs      # logs del control plane en tiempo real
make kind-agents    # watch de todos los pods (agentes incluidos)
make kind-status    # resumen rápido del estado
make kind-down      # destruye el cluster (todo se borra)
```

---

## Rotar la API key de Anthropic

Si cambias de clave o es la primera vez que arrancas con una ya existente:

```bash
ANTHROPIC_API_KEY=sk-ant-... make kind-seed-key
```

Esto inserta la clave en Postgres para todos los workspaces y recicla los pods de agentes para que la cojan.

---

## Arquitectura del POC

```
Browser (localhost:9080)
  └── NGINX ingress (kind)
        ├── /   → frontend (React + nginx, puerto 80)
        └── /   → control-plane (TypeScript, puerto 8080)
              ├── Postgres (StatefulSet, namespace houston-system)
              └── Agent pods (namespaces ws-<id>, un pod por agente)
                    └── pi runtime (Node.js, modelo claude-sonnet-4-6)
```

Cada agente es un pod independiente en su propio namespace `ws-<workspaceId>`. El runtime arranca en modo servidor (`mode=server`) y el control plane le hace proxy de los turnos. Los ficheros del agente viven en `/data` dentro del pod (se pierden al borrar el pod — es un POC).

---

## Troubleshooting

**Pantalla en blanco al abrir la app**

```bash
make kind-logs  # busca errores de arranque del CP
```

**Agente pensando infinito (sin respuesta)**

El runtime no tiene credenciales de Anthropic. Solución:

```bash
ANTHROPIC_API_KEY=sk-ant-... make kind-seed-key
```

**Error TLS / `kubectl` no responde**

El contenedor de kind se ha quedado sin recursos. Reinícialo:

```bash
docker restart houston-control-plane
sleep 8
kubectl --context kind-houston get pods -n houston-system
```

**`exec format error` al cargar imágenes**

Estás en Apple Silicon (ARM). Las imágenes hay que buildearlas para AMD64:

```bash
docker buildx build --platform linux/amd64 -t houston/engine-pod:local \
  -f cloud/k8s/poc/engine-pod.Dockerfile .
# (el Makefile ya pasa --platform linux/amd64 automáticamente)
```

**Ver logs del runtime de un agente específico**

```bash
# Listar namespaces de agentes
kubectl --context kind-houston get ns | grep ws-

# Entrar en el log
kubectl --context kind-houston -n ws-<id> get pods
kubectl --context kind-houston -n ws-<id> exec <pod> -- tail -f /data/runtime.log
```
