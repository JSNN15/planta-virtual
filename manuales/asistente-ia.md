# Manual del asistente de IA industrial

Qué es el asistente, cómo razona, qué puede y qué no puede hacer, y cómo se mantiene su conocimiento. Aplica a todos los roles.

## IA-1.1 · Qué es y qué no es

El asistente es una capa de **nivel 3 del modelo Purdue** (operaciones) que lee la planta, explica lo que pasa con evidencia y propone acciones de un catálogo cerrado. **No es un sistema de control:** no tiene lazos, no maneja enclavamientos y no reemplaza al SIS. Si el asistente o la nube fallan, la planta sigue operando igual.

Puede:

- Anticipar alarmas por tendencia, agrupar alarmas en una causa probable y detectar anomalías sin alarma.
- Responder en lenguaje natural citando tags y valores reales.
- Proponer hasta tres acciones del catálogo, con su riesgo, precondiciones y efecto esperado.
- Enseñar el procedimiento del manual para lo que no puede hacer.

No puede:

- Ejecutar nada sin aprobación humana.
- Anular permisivos o enclavamientos, inhibir alarmas o cambiar límites (reglas S1 y S3).
- Rearmar un equipo disparado por protección ni cerrar un interruptor (reglas S2 y S5).
- Energizar la nave fuera de la secuencia de puesta en servicio (regla S4).

## IA-1.2 · El pipeline de cada pregunta

1. **Entender** (Nemotron Lightning, rápido): intención (estado, diagnóstico, acción, enseñar, KPI), objetos de la planta y qué herramientas consultar.
2. **Consultar** (en el navegador): herramientas de solo lectura sobre la planta y búsqueda en estos manuales.
3. **Diagnosticar** (Nemotron Super, con esquema JSON estricto): causa, evidencia, acciones del catálogo, pasos del manual y lo que no sabe.
4. **Verificar** (código determinista): cada tag existe, cada valor coincide con la planta, cada acción está en el catálogo y cumple sus precondiciones y las reglas duras.
5. **Reanalizar** una sola vez si el modelo inventó datos o acciones, con la lista de errores.
6. **Proponer:** tarjetas de acción que una persona aprueba en dos pasos.
7. **Seguimiento:** el asistente vigila que la acción tenga el efecto esperado en su plazo y lo anota en la bitácora.

En «Cómo llegué a esto», bajo cada respuesta, se ve qué modelo respondió cada etapa, cuánto tardó y qué corrigió el verificador.

## IA-1.3 · Herramientas de consulta

Todas son de solo lectura:

| Herramienta   | Devuelve                                                                                |
| ------------- | --------------------------------------------------------------------------------------- |
| estado_planta | Foto completa: alarmas, tags clave y fuera de banda, motores con novedad, KPI, bitácora |
| tag           | Valor, unidad, banda normal y límites de alarma                                         |
| tendencia     | Mínimo, máximo y pendiente de las últimas 2 h                                           |
| alarma        | Estado de la alarma y su ficha: causas, consecuencia, acción y tiempo de respuesta      |
| equipo        | Marcha, disparo, vibración con zona ISO, permisivos y por qué no parte                  |
| lazo          | Modo, consigna, medición y salida                                                       |
| secuencia     | Estado y paso en curso de las secuencias 100 y 400                                      |
| manual        | Secciones de estos manuales que responden la búsqueda                                   |
| reglas        | Rangos químicos y riesgos de seguridad del área                                         |

## IA-1.4 · El verificador y las reglas duras

El modelo puede equivocarse; el verificador no confía en él. Revisa cada respuesta contra la planta y la base de conocimiento:

- **Datos:** un tag inexistente se elimina; un valor distinto al real se corrige y se marca «corregido por el verificador».
- **Catálogo:** una acción fuera del catálogo se descarta (regla S3).
- **Precondiciones:** una acción cuyos permisivos o condiciones no se cumplen hoy se muestra en «Lo que no puedo proponer», con el motivo.
- **Consignas:** dentro de la banda normal y con pasos de hasta 10 % del rango (regla S6).
- **Cantidad:** máximo tres acciones (regla S8).

Las reglas S1 a S9 están en `conocimiento/reglas_seguridad.json`.

## IA-1.5 · Aprobar una acción

1. Elige tu rol arriba del panel. El jefe de turno aprueba lo de operación y mantenimiento; gerencia solo consulta (regla S9).
2. Lee la tarjeta: riesgo, quién aprueba, efecto esperado y si las precondiciones se cumplen **ahora**.
3. «Revisar y aprobar» muestra qué se va a ejecutar y a nombre de quién. Las de riesgo alto piden confirmar que verificaste en terreno (regla S7).
4. «Confirmar y ejecutar» envía la orden a la planta por los mismos comandos que usa la HMI: permisivos y enclavamientos siguen mandando.
5. La bitácora registra «Asistente propuso y _rol_ aprobó» y, después, si tuvo el efecto esperado.

## IA-1.6 · Niveles de autonomía

| Nivel | Qué hace la IA                               | En esta planta                                                                           |
| ----- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 0     | Nada                                         | —                                                                                        |
| 1     | Informa y explica                            | Avisos y conversación                                                                    |
| 2     | Propone y ejecuta solo con aprobación humana | **Nivel actual**                                                                         |
| 3     | Ejecuta sola dentro de límites               | No se usa: exigiría validación en terreno, gestión del cambio y separación total del SIS |

## IA-1.7 · Cuando no hay IA o se equivoca

- **Sin conexión** con el intermediario o con NVIDIA, el asistente responde con el **diagnóstico por reglas**: usa las mismas fichas, catálogo y verificador. El indicador del panel dice «reglas locales». También puedes desactivar la IA a propósito.
- **Si una respuesta no te convence,** revisa la evidencia y la tendencia del tag. El criterio del operador manda.
- **Si una acción no tuvo efecto,** el seguimiento lo avisa. Pregunta «por qué» con el aviso del seguimiento o revisa en terreno.

## IA-1.8 · Mantener el conocimiento

El conocimiento vive en archivos que se revisan como código:

- `conocimiento/alarmas.json`: ficha de cada alarma (ISA-18.2): causas, consecuencia, acción del operador, tiempo de respuesta, acciones sugeridas y sección del manual.
- `conocimiento/acciones.json`: catálogo cerrado de acciones con rol, riesgo, objetivo, precondiciones, efecto esperado y manual.
- `conocimiento/reglas_*.json`: reglas físicas (Faraday, balances), químicas (rangos) y de seguridad (S1 a S9).
- `conocimiento/tags.json` y `causa_efecto.json`: se generan desde el simulador con `node herramientas/generar-conocimiento.js`.
- `manuales/*.md`: una sección por procedimiento, con el título `## XX-n.m · Título`.

Las pruebas (`node test/sim.test.js` y `node test/ia.test.js`) fallan si una alarma del simulador no tiene ficha, si una ficha cita una sección de manual que no existe o si una acción del catálogo no tiene precondiciones conocidas.

## IA-1.9 · Cómo se evalúa

`node herramientas/evaluar-ia.mjs` corre los escenarios de falla del simulador y mide, para el diagnóstico por reglas (y para el modelo, si hay clave de NVIDIA): si la causa coincide con la esperada, si las acciones son válidas, cuántos datos tuvo que corregir el verificador y cuánto tardó. Es la línea base para comparar cambios de prompt o de modelo.
