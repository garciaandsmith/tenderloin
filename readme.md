# Sistema de Inteligencia para Licitaciones Públicas (PLACSP)

Este proyecto automatiza la extracción, filtrado y análisis de licitaciones de la Plataforma de Contratación del Sector Público.

## 📂 Estructura del Proyecto
* **/data**: Contiene `historico_licitaciones.csv`. Es la base de conocimiento con ~800 registros puntuados (columna `Objeto` y `Score`) para guiar la evaluación inteligente.
* **/config**: 
    * `CodigosCPV.txt`: Códigos de actividad de interés.
    * `credenciales_agencia.txt`: Capacidades y perfil de la agencia.
    * `scoring.txt`: Criterios detallados del sistema de puntuación (0-5).

## ⚙️ Flujo de Trabajo (Pipeline)
1. **Extracción**: Conexión a la PLACSP y captura de nuevas licitaciones.
2. **Filtrado Inicial**: 
   - Por fecha (recientes).
   - Por CPV (según lista en `/config`).
   - Por Región (Inicial: Comunidad de Madrid).
   - Por Presupuesto (Inicial: > 40.000€).
3. **Evaluación de Objeto**: Clasificación de adecuación (0-5) basada en el histórico de `/data`.
4. **Análisis Profundo**: Para puntuaciones 4 y 5, el sistema accede a la URL de la licitación, procesa documentos adjuntos y genera un resumen estructurado.
5. **Notificación**: Envío de resúmenes por email.