# Plan de desarrollo por fases — Monitor de licitaciones PLACSP

Este plan divide la solución en entregas autocontenidas para validar valor temprano, reducir riesgo técnico y poder ajustar reglas/IA en cada iteración.

## Objetivos de diseño (transversales)

- **Modularidad**: cada bloque (captura, filtrado, scoring, análisis, notificación) se implementa como módulo desacoplado.
- **Reproducibilidad**: ejecuciones deterministas con logs y almacenamiento de resultados por fecha.
- **Configurabilidad**: reglas de filtrado y parámetros en `/config` (con opción de override por variables de entorno).
- **Evolución del modelo**: empezar con baseline gratuito y preparar la arquitectura para cambiar de modelo sin romper el pipeline.

---

## Fase 0 — Alineación funcional y contrato de datos

### Objetivo
Definir qué entra/sale en cada etapa para evitar retrabajo posterior.

### Entregables
- Esquema de datos normalizado de licitaciones (JSON/CSV interno).
- Definición de campos mínimos: id expediente, órgano, CPV, presupuesto, región, fecha límite, URL, objeto.
- Convención de estados (`raw`, `filtered_out`, `scored`, `high_value`, `notified`).
- Decisión de persistencia inicial (SQLite recomendado para empezar).

### Criterio de aceptación
- Documento de contrato de datos aprobado y usado por todos los módulos.

---

## Fase 1 — Captura incremental diaria (MVP ingestión)

### Objetivo
Extraer nuevas licitaciones publicadas desde la última ejecución.

### Alcance técnico
- Cliente de extracción PLACSP desacoplado (`placsp_client.py`).
- Control de incrementalidad con `last_run_at` en SQLite.
- Job ejecutable por CLI (`python -m app.run_capture`) preparado para cron diario.
- Manejo de errores/reintentos y log estructurado.

### Entregables
- Módulo de captura con salida en tabla `tenders_raw`.
- Script de ejecución diaria.
- Logs por ejecución (`run_id` o timestamp).

### Criterio de aceptación
- En una segunda ejecución consecutiva no duplica registros ya capturados.

---

## Fase 2 — Filtrado duro configurable

### Objetivo
Aplicar filtros de negocio no negociables antes de IA.

### Reglas iniciales
- Vigencia: plazo de presentación no vencido.
- Región: Comunidad de Madrid.
- Presupuesto: > 40.000€.
- Temática: match con CPV en `/config/CodigosCPV.txt`.

### Recomendación de configuración
- Mantener reglas en un archivo de configuración versionado (por ejemplo `config/filters.yaml`).
- Cargar CPV desde `CodigosCPV.txt`, pero permitir también incluir/excluir en YAML para cambios rápidos sin tocar lógica.

### Entregables
- Módulo `hard_filter.py` con trazabilidad del motivo de descarte.
- Tabla `tenders_filtered` con columnas: `passed_filter`, `discard_reason`.
- Tests unitarios de cada regla.

### Criterio de aceptación
- Cada licitación descartada indica claramente por qué regla fue excluida.

---

## Fase 3 — Scoring inteligente (baseline IA + aprendizaje supervisado)

### Objetivo
Asignar score 0–5 usando relación histórica entre `Objeto` y `Score`.

### Enfoque recomendado (gratis y robusto)
1. Embeddings con `sentence-transformers` (modelo multilingüe).
2. Modelo supervisado ligero encima de embeddings (Regresión/Clasificación con `scikit-learn`).
3. Features adicionales de texto opcionales (longitud, palabras clave de agencia).

### Datos de entrenamiento
- `data/historico_licitaciones.csv` como dataset inicial.
- `config/credenciales_agencia.txt` y `config/scoring.txt` como conocimiento de negocio para enriquecer prompts/features.

### Entregables
- Pipeline de entrenamiento reproducible (`train_scoring_model.py`).
- Artefactos versionados (`models/scoring_model.pkl`, `models/vectorizer_or_embeddings_meta.json`).
- Módulo de inferencia (`score_tenders.py`) para nuevas licitaciones filtradas.
- Métricas base (MAE/F1 según formulación) y validación temporal simple.

### Criterio de aceptación
- El modelo produce score 0–5 y mejora frente a baseline trivial (por ejemplo, predecir media).

---

## Fase 4 — Análisis de alto valor (scores 4–5)

### Objetivo
Para licitaciones prioritarias, extraer un resumen operativo para decidir concurrencia.

### Flujo
- Abrir URL de la licitación.
- Localizar y descargar/leer pliegos.
- Resumir en 4 bloques:
  1. Datos clave y plazos.
  2. Servicios requeridos.
  3. Requisitos técnicos.
  4. Requisitos administrativos.

### Recomendación técnica
- Parser por tipo de documento (HTML/PDF).
- Si no hay extracción fiable de PDF, usar OCR opcional como fallback.
- LLM opcional solo en esta fase para síntesis final (controlando coste).

### Entregables
- Módulo `high_value_analyzer.py` con salida estructurada JSON.
- Evidencia de fuente (fragmentos/citas del pliego por sección).

### Criterio de aceptación
- Cada resumen de score 4–5 contiene los 4 apartados, con datos verificables.

---

## Fase 5 — Notificación y reporte operativo

### Objetivo
Enviar resumen diario accionable por email + almacenamiento consultable.

### Requisitos
- Incluir licitaciones de interés (score 4–5).
- Incluir licitaciones con score 0 para revisión humana.
- Formato legible en texto/HTML.

### Entregables
- Generador de reporte diario (`report_builder.py`).
- Envío por email (`notifier_email.py`) con SMTP configurable.
- Registro de notificaciones enviadas para evitar duplicados.

### Criterio de aceptación
- Llega un email diario con secciones separadas (Interés alto / Revisión humana).

---

## Fase 6 — Orquestación end-to-end y operación

### Objetivo
Unificar todo en un pipeline diario estable y observable.

### Alcance
- Comando único (`python -m app.run_daily_pipeline`).
- Orquestación secuencial con control de fallos por etapa.
- Métricas mínimas: nº capturadas, nº filtradas, distribución de scores, nº notificadas.
- Backfill manual (ejecutar rango de fechas) sin romper incrementalidad.

### Entregables
- Job diario listo para cron/CI runner.
- Dashboard básico de logs o export CSV de métricas.

### Criterio de aceptación
- 7 días seguidos de ejecución sin intervención manual.

---

## Fase 7 — Mejora continua del modelo y gobernanza

### Objetivo
Cerrar ciclo de aprendizaje con feedback real de la agencia.

### Acciones
- Añadir etiquetas humanas periódicas al histórico.
- Reentrenamiento mensual automatizado.
- Monitor de drift (cambio en distribución de objetos/CPV/scores).
- Ajuste de umbrales (qué se considera “interés”).

### Entregables
- Proceso de reentrenamiento versionado.
- Informe comparativo de modelos por periodo.

### Criterio de aceptación
- Mejora sostenida de métricas y reducción de falsos positivos en scores altos.

---

## Arquitectura sugerida de carpetas (referencia)

```text
/workspace/tenderloin
  /app
    /capture
    /filtering
    /scoring
    /analysis
    /notification
    /orchestration
  /config
  /data
  /models
  /reports
  /tests
  /docs
```

---

## Plan de ejecución recomendado (orden real)

1. **Fase 0 + Fase 1**: tener datos nuevos diarios confiables.
2. **Fase 2**: reducir ruido con reglas duras.
3. **Fase 3**: introducir scoring IA con baseline medible.
4. **Fase 5 (parcial)**: notificar aunque sea con scoring y sin análisis profundo.
5. **Fase 4**: enriquecer solo licitaciones 4–5.
6. **Fase 6 + 7**: industrializar y mejorar continuamente.

Este orden maximiza valor temprano: primero detección útil y envío diario; después profundidad analítica.
