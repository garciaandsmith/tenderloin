# Fase 1 implementada — Captura diaria incremental

## Qué incluye

- Cliente de captura desacoplado (`app/capture/placsp_client.py`) con soporte para fuente remota (HTTP) y local (`file://`) para pruebas.
- Extracción de campos de negocio desde Atom (CPV, región/NUTS, órgano, fecha límite y presupuesto) cuando están disponibles en el feed.
- Persistencia SQLite para licitaciones crudas en `tenders_raw` con deduplicación por `(external_id, source)`.
- Estado incremental en `pipeline_state` (`capture.last_successful_run_at`).
- Servicio de orquestación de captura (`app/capture/service.py`).
- CLI ejecutable diariamente: `python -m app.run_capture`.

## Ejecución recomendada (diaria)

La fuente de datos son los **resúmenes diarios** (ZIPs mensuales actualizados a diario) que publica
la Plataforma de Contratación del Sector Público en abierto, sin necesidad de registro como actor
empresarial. La URL tiene la forma:
`https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3_AAAAMM.zip`

```bash
python -m pipeline.run_capture \
  --db-path data/runtime/tenderloin.db \
  --overlap-minutes 120
```

La URL por defecto apunta siempre al ZIP del mes en curso. Si el archivo del mes actual no está
disponible todavía (primeros días del mes), el script usa automáticamente el ZIP del mes anterior
como fallback.

## Programación cada 24 horas (cron)

```cron
0 7 * * * cd /ruta/al/repo && /usr/bin/python3 -m pipeline.run_capture --db-path data/runtime/tenderloin.db >> logs/capture.log 2>&1
```

## Parámetro de robustez incremental

- `--overlap-minutes` (por defecto `120`) vuelve a consultar una ventana anterior para reducir riesgo de perder publicaciones tardías; la deduplicación evita duplicados al reingestar.

## Nota de alcance

Esta fase cubre la captura incremental y la persistencia de datos brutos. El filtrado duro, scoring IA y notificación se implementan en fases posteriores.
