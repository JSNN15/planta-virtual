# Manual de mantenimiento · Planta virtual LX-SX-EW

Para el planificador, el supervisor y los técnicos de mantenimiento. Las secciones **MT-x.y** las citan las fichas de alarma, el catálogo de acciones y el asistente. Las intervenciones del simulador son simplificadas: en planta real cada una lleva su análisis de riesgo, permiso de trabajo y bloqueo.

## MT-1.1 · Estrategia y criticidad

| Criticidad               | Equipos                                     | Estrategia                                                              |
| ------------------------ | ------------------------------------------- | ----------------------------------------------------------------------- |
| A · detiene producción   | RT-401, P-401A/B, P-305, P-201A/B, P-202A/B | Respaldo instalado o monitoreo de condición; repuesto crítico en bodega |
| B · baja producción      | CR-101, M-103, mezcladores M-301 a M-304    | Monitoreo de condición y preventivo planificado                         |
| C · sin efecto inmediato | P-102, P-104, P-501, FD-101                 | Preventivo y correctivo                                                 |

Cada motor lleva sus horas desde el último preventivo (cada 2.000 h) en la vista de mantenimiento. El asistente prioriza los avisos por criticidad y por zona de vibración.

## MT-2.1 · Vibración: zonas ISO 20816-3

La severidad se mide en velocidad RMS (mm/s) y se juzga por grupo de máquina:

| Zona | Grupo 1 (> 300 kW: CR-101, M-103, CV-101, P-201, P-202) | Grupo 2 (15 a 300 kW) | Qué significa                                                           |
| ---- | ------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------- |
| A    | < 2,3                                                   | < 1,4                 | Máquina nueva o recién reparada                                         |
| B    | 2,3 a 4,5                                               | 1,4 a 2,8             | Operación sin restricción                                               |
| C    | 4,5 a 7,1                                               | 2,8 a 4,5             | Operación restringida: programar la intervención y vigilar la tendencia |
| D    | > 7,1                                                   | > 4,5                 | Riesgo de daño: detener en forma controlada                             |

La alarma .VIB (prioridad baja) marca la zona C y .VIBH (media) la zona D. Una vibración que **sube rápido** pesa más que su valor: el asistente la anticipa con la tendencia.

## MT-3.1 · Cambio de rodamiento del tambor M-103

**Síntoma:** VIT-M-103 subiendo hacia zona C con patrón de daño de rodamiento (la vibración crece sola, sin cambio de carga).

1. Coordina con operación: el tambor detenido para la aglomeración. La pila sigue entregando cobre por semanas, pero el acopio se llena si el chancador sigue.
2. Operación detiene el área 100 con su secuencia (OP-5.1).
3. Bloqueo y etiquetado del motor M-103 (MT-4.2).
4. Cambia el rodamiento, alinea y verifica la lubricación. En el simulador la intervención toma 30 min.
5. Entrega a operación, que parte con la secuencia. Comprueba que VIT-M-103 quede en zona A.

## MT-3.2 · Monitoreo continuo de voltaje de celdas

Sin monitoreo, los cortocircuitos entre ánodo y cátodo solo se detectan en la **ronda manual cada 4 h**. Cada cortocircuito desvía corriente que no deposita cobre: baja KY-406 y se pierde producción.

1. Activa el monitoreo continuo: cada celda reporta su voltaje y una celda en cortocircuito se marca al instante con su número.
2. El operador de nave corrige las celdas marcadas en operación, con herramienta aislada (OP-4.4).
3. Verifica que KY-406 vuelva sobre 90 %.

## MT-3.3 · Cambio de revestimientos del chancador CR-101

**Síntoma:** P80 (AIT-100) sobre 14 mm y subiendo. El desgaste de los revestimientos abre la descarga y el mineral sale grueso.

**Por qué importa:** la pila recupera menos cobre del mineral grueso (menos superficie expuesta al ácido). El efecto llega al PLS en uno o dos días, cuando ya es tarde para corregirlo.

1. Comprueba que el acopio fino tenga **más de 5.000 t**: la planta sigue alimentando con el acopio mientras el chancador está detenido 2 h.
2. Detén CR-101 y aplica bloqueo y etiquetado.
3. Cambia los revestimientos (manto y cóncavo) y ajusta el setting.
4. Entrega y verifica que AIT-100 baje a ≈ 12,5 mm en las horas siguientes.

## MT-3.4 · Calibración del analizador de pH AIT-207

**Síntoma:** AIT-207 se aleja más de 0,1 del laboratorio (el asistente lo avisa) o salta la alarma AIT-207.DEV (más de 0,15).

1. Pasa el lazo que use el pH a manual o confirma que no controla nada mientras calibras.
2. Limpia el electrodo y calibra con tampones de pH 2 y 4.
3. Compara con una muestra de laboratorio. Si la deriva vuelve en días, cambia el electrodo.

## MT-3.5 · Retiro de borra en SX

**Síntoma:** arrastre acuoso (AIT-309) sobre 400 ppm, interfase de E1 (LIT-303) sobre 0,38 m. La borra es una emulsión estable de orgánico, acuoso y sólidos finos que se acumula en la interfase del decantador.

1. Retira la borra con la bomba de borra desde la interfase de E1.
2. Envía la borra a tratamiento (centrífuga o filtro) para recuperar el orgánico.
3. Revisa el origen: sólidos en el PLS (pila con finos, glómero húmedo) o degradación del orgánico.

## MT-3.6 · Intercambiador de calor HX-401

**Síntoma:** temperatura del electrolito (TIT-403) bajando aun con TIC-403 al 100 %. Bajo 40 °C sube el voltaje de celda y el depósito sale rugoso.

1. Revisa el agua caliente y las válvulas del intercambiador.
2. Si hay ensuciamiento, limpia las placas (incrustación de yeso es lo típico).
3. Repara y verifica que TIT-403 vuelva a 45 °C en unas dos horas.

## MT-4.1 · Avisos, órdenes y preventivo

- El asistente genera avisos de mantenimiento a partir de la condición (vibración, P80, analizadores, cortocircuitos) y los muestra en la vista de mantenimiento.
- Un aviso se convierte en orden cuando se planifica: repuestos, personas, permiso y ventana con operación.
- El preventivo de cada motor se programa cada 2.000 h de marcha.
- Las intervenciones aprobadas al asistente quedan en la bitácora con el rol que aprobó y el seguimiento de su efecto.

## MT-4.2 · Bloqueo y etiquetado

Ninguna intervención sobre un equipo energizado. Antes de intervenir:

1. Detén el equipo desde la sala y confirma que se detuvo.
2. Abre el interruptor o seccionador en terreno, instala tu candado y tu tarjeta personal.
3. Prueba de energía cero: intenta partir localmente y verifica ausencia de tensión.
4. Al terminar, cada persona retira solo su candado. El último entrega a operación.

El asistente **nunca** cierra interruptores ni rearma un equipo disparado por protección (reglas S2 y S5).
