# Fase 1 implementada — Captura diaria incremental

## Qué incluye

- Cliente de captura desacoplado (`app/capture/placsp_client.py`) con soporte para fuente remota (HTTP) y local (`file://`) para pruebas.
- Persistencia SQLite para licitaciones crudas en `tenders_raw` con deduplicación por `(external_id, source)`.
- Estado incremental en `pipeline_state` (`capture.last_successful_run_at`).
- Servicio de orquestación de captura (`app/capture/service.py`).
- CLI ejecutable diariamente: `python -m app.run_capture`.

## Ejecución recomendada (diaria)

```bash
python -m app.run_capture \
  --db-path data/runtime/tenderloin.db \
  --source-url "https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto.xml"
```

## Programación cada 24 horas (cron)

```cron
0 7 * * * cd /ruta/al/repo && /usr/bin/python3 -m app.run_capture --db-path data/runtime/tenderloin.db >> logs/capture.log 2>&1
```

## Nota de alcance

Esta fase cubre la captura incremental y la persistencia de datos brutos. El filtrado duro, scoring IA y notificación se implementan en fases posteriores.
