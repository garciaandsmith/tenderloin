# LicitaciónInteligente - Herramienta de Scouting para Agencia de Comunicación

Este proyecto permite a una agencia de comunicación monitorizar de forma estratégica la Plataforma de Contratación del Sector Público (PLACSP). El objetivo es pasar de una búsqueda manual ineficiente a un sistema de triaje inteligente que detecte oportunidades de alto valor.

## 🎯 Objetivo de Negocio
Identificar concursos públicos donde la agencia tenga altas probabilidades de ganar basándose en su experiencia previa, filtrando por volumen de contrato, región y afinidad temática (CPVs).

## 📂 Estructura de Conocimiento
* **/data/historico_licitaciones.csv**: Base de datos de ~800 experiencias previas evaluadas manualmente (Columna 'Objeto' y 'Score' 0-5). Es la fuente de "aprendizaje" para el sistema.
* **/config/CodigosCPV.txt**: Diccionario de códigos CPV que la agencia puede ejecutar.
* **/config/credenciales_agencia.txt**: Perfil narrativo de la agencia (qué hacemos, en qué somos buenos).
* **/config/scoring.txt**: Definición técnica de qué significa cada nivel de puntuación (0 a 5).

## 🛠️ Roadmap Técnico
1. **Fase de Captura**: Scraping/RSS de la PLACSP.
2. **Fase de Triaje**: Filtros duros (Presupuesto > 40k, Madrid, CPVs).
3. **Fase de IA**: Clasificación de afinidad mediante Procesamiento de Lenguaje Natural (NLP).
4. **Fase de Auditoría**: Análisis profundo de pliegos y generación de resúmenes ejecutivos.
5. **Fase de Interfaz**: (Actual) CLI/Scripts locales -> (Futuro) Interfaz Web/SaaS.