# Manual de gerencia · Planta virtual LX-SX-EW

Para la superintendencia y la gerencia de planta: cómo leer la vista de gerencia, de dónde sale cada número y qué decisiones apoya. La gerencia **consulta**: no opera equipos ni aprueba acciones del asistente (regla S9).

## GE-1.1 · Indicadores del turno

| Indicador                 | Cómo se calcula                                                               | Referencia                                        |
| ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| Cátodo producido          | Suma de lo depositado por Faraday: I × 1,1855 g/A·h × 160 celdas × eficiencia | Plan a la hora                                    |
| Proyección al cierre      | Producido + tasa actual × horas que faltan                                    | Plan del turno (8 h)                              |
| Ingreso del turno         | Cátodo × precio del cobre                                                     | Precio editable en US$/lb                         |
| Energía específica        | MWh de la planta ÷ t de cátodo                                                | Nave EW ≈ 1.900 kWh/t                             |
| Eficiencia de corriente   | Cobre depositado ÷ máximo por Faraday                                         | Sobre 90 %                                        |
| Disponibilidad de la nave | Tiempo con el rectificador en servicio                                        | Sobre 98 %                                        |
| Consumo de ácido          | kg de ácido ÷ t de mineral                                                    | ≈ 20 kg/t                                         |
| Recuperación global       | Cátodo ÷ cobre que entró a las pilas en el turno                              | Curva de 90 días: 64,6 %                          |
| Agua fresca               | m³ ÷ t de mineral                                                             | Indicador de huella hídrica                       |
| Alarmas por hora          | Alarmas nuevas del turno ÷ horas                                              | ISA-18.2: ≈ 6/h aceptable, 12/h máximo            |
| Calidad del cátodo        | Pb, S y Fe estimados                                                          | BS EN 1978 Cu-CATH-1: Pb ≤ 5, S ≤ 15, Fe ≤ 10 ppm |

La recuperación del turno no es la recuperación de la pila: el cobre que entra hoy sale en 90 días. Sirve para ver tendencias, no para cerrar balances.

## GE-1.2 · Pérdidas valorizadas

La tabla de pérdidas separa la brecha contra el plan en causas:

- **Cortocircuitos en la nave:** corriente que no deposita cobre. Se recupera con monitoreo continuo de celdas (MT-3.2) y corrección en operación.
- **Rectificador fuera de servicio:** horas sin corriente. Además del cobre, un corte largo deja plomo en el cátodo y lo saca de grado A.
- **Menos cobre desde pilas y SX:** todo lo demás: mineral grueso (revestimientos, MT-3.3), riego bajo, extracción baja, borra.

Cada pérdida se valoriza al precio vigente. Es la base para priorizar inversiones: por ejemplo, el monitoreo continuo de celdas se paga con lo que recupera en cortocircuitos.

## GE-1.3 · Plan de producción y precio

- **Plan de cátodo (t/h):** al cambiarlo, el jefe de turno recalcula la corriente del plan (OP-4.4). La nave no puede producir más que el cobre que entrega SX: si el plan supera ese balance, el electrolito se empobrece bajo 40 g/L y el depósito se vuelve nodular.
- **Precio del cobre (US$/lb):** solo cambia la valorización. 1 t = 2.204,62 lb.
- **Energía:** US$ 100/MWh en el modelo.

## GE-1.4 · Cosechas y calidad

Cada cátodo permanece 7 días en la celda. La nave se cosecha por lotes: un séptimo de las celdas cada día a las 06:00. Cada lote registra sus toneladas y su calidad estimada (Pb, S, Fe). Un lote fuera de norma se vende con castigo o se refunde: un corte de corriente o cobalto bajo se ve aquí días después.

## GE-2.1 · Cómo apoya el asistente a la gerencia

- Responde preguntas de producción, pérdidas y plan con los datos del turno, y dice lo que no sabe.
- Las acciones que propone las aprueban operación, mantenimiento o el jefe de turno; quedan en la bitácora con el rol que aprobó y el resultado del seguimiento. Eso da trazabilidad para auditar decisiones.
- Niveles de autonomía: el asistente opera en **nivel 2** (propone y ejecuta solo con aprobación humana). No hay nivel 3 (ejecución autónoma) en esta planta: requeriría validación en terreno, gestión del cambio y un SIS independiente que no dependa de la IA.
