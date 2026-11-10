# Manual de operación · Planta virtual LX-SX-EW

Para el operador de sala y el jefe de turno. Cada sección tiene un código (por ejemplo **OP-4.4**) que citan las fichas de alarma de `conocimiento/alarmas.json`, el catálogo de acciones y el asistente de IA. Modelo didáctico: los valores vienen de literatura y del simulador, no de una operación real.

## OP-1.1 · Qué hace la planta

La planta transforma mineral oxidado de cobre (0,6 % Cu) en cátodos de cobre de 99,99 % en cuatro pasos:

1. **Área 100 · Chancado fino y aglomeración.** El chancador CR-101 reduce el mineral a P80 ≈ 12,5 mm. El tambor AD-101 lo mezcla con ácido sulfúrico (≈ 20 kg/t, razón FFIC-102) y agua para curarlo y pegar los finos.
2. **Área 200 · Lixiviación en pilas.** Las bombas P-201A/B riegan la pila con refino ácido. La solución disuelve el cobre y drena como PLS (≈ 3,3 g/L Cu, pH 1,9) a la piscina TK-202. La pila responde con retardo: lo que se riega hoy se ve en el PLS en 12 a 24 h.
3. **Área 300 · Extracción por solventes.** Un extractante orgánico toma el cobre del PLS en E1 y E2, se lava del arrastre acuoso en W1 y lo entrega al electrolito en S1. Separa el cobre del hierro, el cloruro y el manganeso.
4. **Área 400 · Electroobtención.** El rectificador RT-401 hace pasar ≈ 36 kA por 160 celdas en serie. Por Faraday, cada A·h deposita 1,1855 g de cobre en los cátodos permanentes de acero 316L, que se cosechan cada 7 días.

El área 500 da energía (barra de 23 kV, MCC-100 a 400, filtro de armónicos), ácido (TK-501) y agua (TK-502).

| Paso         | Entra                        | Sale                      | Variable que manda                            |
| ------------ | ---------------------------- | ------------------------- | --------------------------------------------- |
| Aglomeración | mineral + ácido + agua       | glómero curado            | KY-102 dosis de ácido (kg/t)                  |
| Lixiviación  | refino ácido                 | PLS con cobre             | AIT-206 Cu en PLS (g/L)                       |
| SX           | PLS + electrolito pobre      | refino + electrolito rico | KY-303 extracción (%)                         |
| EW           | electrolito rico + corriente | cátodo                    | IIT-401 corriente (kA), KY-406 eficiencia (%) |

## OP-2.1 · La HMI en un minuto

- **Pantalla General:** las cinco áreas con su estado, alarmas por área y KPI del turno.
- **Pantallas de área:** símbolos ISA-5.1. Un clic en un equipo, válvula o controlador abre su placa (faceplate). Toda orden se selecciona y luego se confirma: nada se ejecuta con un solo clic.
- **Alarmas:** prioridad alta (actuar ya), media (en el turno) y baja (programar), según ISA-18.2. Se reconocen, se archivan con plazo o se suprimen por estado del equipo.
- **Asistente de turno:** la caja morada de cada pantalla. Muestra alarmas que vienen, causa probable, anomalías y recomendaciones; cada aviso trae su acción, «Por qué» y «Cómo».
- **Tendencias:** hasta 8 h de historia por tag, exportable a CSV.

## OP-3.1 · Lazos de control: modos y consignas

Cada lazo tiene un **modo normal** (AUTO o CAS) que aparece en su placa. MAN es solo para una maniobra puntual.

1. Antes de cambiar una consigna, mira la tendencia de 20 min del PV: si oscila, no la cambies, revisa la sintonía o la válvula.
2. Cambia la consigna en pasos de hasta **10 % del rango** y dentro de la banda normal del tag (regla S6). Espera a que el PV se estabilice antes del siguiente paso.
3. Si dejaste un lazo en MAN, devuélvelo a su modo normal al terminar. El asistente lo avisa en «lazos fuera de modo normal».
4. En cascada (CAS) la consigna la fija otro lazo o un cálculo: FFIC-102 recibe la razón de ácido del mineral pesado y IIC-401 recibe la corriente del plan (OP-4.4).

## OP-3.2 · Partir, detener y rearmar equipos

1. **Partir:** abre la placa del equipo y revisa sus permisivos. Si uno falta, la placa dice cuál («por qué no parte»). Selecciona Partir y confirma.
2. **Detener:** confirma que el respaldo esté disponible o que la detención esté coordinada. Detener una bomba de riego, de PLS o de electrolito afecta aguas abajo.
3. **Disparo:** lee la causa en la placa y en la bitácora.
   - Si la causa es una **protección** (vibración, temperatura, sobrecorriente, sobrecarga), **no rearmes**: avisa a mantenimiento. Rearmar sin inspección puede destruir el equipo (regla S2).
   - Si la causa fue externa (cordón de emergencia ya repuesto, pérdida de tensión ya normalizada), rearma y parte.
4. **Bombas duplicadas** (P-201A/B, P-202A/B, P-401A/B): ante el disparo de una, parte la otra de inmediato y deja la falla para mantenimiento. Con «respaldo automático» la de reserva parte sola.

## OP-3.3 · Interruptor abierto

Un interruptor abierto (52-RT o la alimentación de un MCC) deja sin energía a todo lo que cuelga de él. La causa probable es la protección eléctrica.

1. Identifica qué quedó sin energía: el asistente agrupa las alarmas que aparecieron después del interruptor.
2. **No lo cierres desde la sala** si abrió por protección: el eléctrico de turno revisa, aplica bloqueo y etiquetado, y cierra en terreno (regla S5).
3. Prepara la partida del área con su secuencia (OP-5.1, OP-5.2) para cuando el eléctrico entregue.

## OP-4.1 · Área 100: chancado y aglomeración

**Objetivo:** 1.700 t/h al tambor con 20 kg/t de ácido y 9 % de humedad.

- **Acopio fino (LIT-100) bajo 8.000 t:** el chancador no repone. Revisa CR-101. Con 1.700 t/h de consumo, 8.000 t dan menos de 5 h; bajo 2.000 t (LL) baja el alimentador antes de quedar sin mineral.
- **Peso en correa (WIT-101) bajo:** revisa FD-101, la tolva y el acopio.
- **Dosis de ácido (KY-102) fuera de banda:** revisa FFIC-102 en CAS, la bomba P-102 y el estanque diario TK-103 (lo rellena P-501 bajo 40 %). Activa la **compensación de retardo** de la correa: el ácido llega 45 s antes que el mineral y sin ella la dosis varía más.
- **Humedad del glómero (AIT-105) fuera de banda:** ajusta la razón de agua FFIC-104. Glómero seco no cura; glómero muy húmedo se desarma en la pila y la tapa.
- **P80 (AIT-100) sobre 14 mm (alarma en 15):** revestimientos de CR-101 gastados. Mineral grueso recupera menos en la pila y el PLS lo sentirá en uno o dos días. Coordina el cambio con mantenimiento (MT-3.3).

## OP-4.2 · Área 200: lixiviación y piscinas

**Objetivo:** riego estable de ≈ 2.100 m³/h y PLS sobre 3 g/L de cobre.

- **Presión de riego (PIT-202) baja:** bomba P-201 disparada o fuga. Parte la de respaldo (OP-3.2).
- **Caudal de riego (FIT-200) bajo:** revisa FIC-201 y la presión.
- **Piscinas:** el refino (LIT-201) y el PLS (LIT-204) se balancean con SX. Si el PLS sube, SX no está tomando solución (P-202 o P-305 detenidas); si baja, revisa el riego.
- **Cobre en PLS (AIT-206) bajo:** la pila entrega menos. Causas: mineral grueso (P80 alto), riego bajo, ácido insuficiente, o un sector nuevo que todavía no drena.
- **pH del PLS (AIT-207):** sobre 2,2 precipita hierro en la pila; bajo 1,6 se consume ácido sin cobre. Si el analizador no coincide con el laboratorio, calíbralo antes de usarlo para controlar (MT-3.4).

## OP-4.3 · Área 300: extracción por solventes y lavado W1

**Objetivo:** extracción (KY-303) sobre 90 % con arrastre acuoso (AIT-309) bajo 400 ppm (alarma en 500).

- **Caudal de PLS a SX (FIT-205) bajo:** revisa P-202A/B.
- **Cobre en el refino (AIT-208) alto:** el orgánico no alcanza a extraer. Revisa la razón O/A, la bomba P-305 y la carga del orgánico (AIT-302).
- **Lavado W1 (M-304):** retira del orgánico el acuoso arrastrado, que trae **cloruro y hierro** del PLS. Sin W1 el cloruro del electrolito sube en horas. Si M-304 disparó por sobrecarga, mantenimiento lo revisa antes de rearmar; si fue por otra causa, rearma y parte.
- **Borra (crud):** sube el arrastre y la interfase de E1 (LIT-303). Se retira con la bomba de borra (MT-3.5).

## OP-4.4 · Área 400: electroobtención

**Objetivo:** corriente del plan (≈ 36 kA), eficiencia de corriente (KY-406) sobre 90 %, cobre en electrolito (AIT-405) 40 a 48 g/L y cátodo grado A.

- **Corriente del plan.** IIC-401 recibe en AUTO la consigna que deposita lo que entrega SX y lleva el cobre del electrolito a 44 g/L en un turno: _I = (Cu de SX − Cu del sangrado + corrección) ÷ (1,1855 g/A·h × 160 celdas × eficiencia)_. Si AIT-405 se aleja más de 2,5 g/L de la consigna, **recalcula la corriente del plan** (jefe de turno).
- **Electrolito (FIT-402) bajo:** sin circulación el rectificador dispara. Parte P-401B si P-401A falló.
- **Temperatura (TIT-403):** 42 a 50 °C. Baja: revisa HX-401 (MT-3.6). Alta: neblina ácida y degradación del orgánico.
- **Cobalto (AIT-408) bajo 120 mg/L (alarma en 110):** el ánodo de plomo se corroe y el plomo contamina el cátodo. Revisa la dosificación.
- **Hierro (AIT-407) alto:** el Fe³⁺ consume corriente útil y baja la eficiencia. Revisa el arrastre (OP-4.3) y el sangrado.
- **Cloruro (AIT-410) sobre 30 mg/L:** pica el cátodo permanente de 316L. Revisa el lavado W1 y aumenta el sangrado.
- **Cortocircuitos (CELDA-\*.V, KY-406 baja):** se corrigen **en operación**: el operador de nave separa o retira el cátodo con herramienta aislada. Sin monitoreo continuo solo se ven en la ronda cada 4 h.
- **Corte de corriente:** con la nave sin corriente el ánodo libera plomo y el cátodo sale de norma por un tiempo. Si se para, usar **corriente de protección** (5 kA) con la secuencia (OP-5.2).

## OP-4.5 · Área 500: energía, ácido y agua

- **Factor de potencia (KY-501) bajo 0,92 o distorsión alta:** pon en servicio el filtro de armónicos y los condensadores. El rectificador de 12 pulsos genera armónicos 11 y 13.
- **Stock de ácido (LIT-501):** la aglomeración consume ≈ 34 t/h. La alarma baja está en 400 t y la crítica en 150 t: coordina camiones (30 t cada uno) o baja la dosis antes de llegar ahí.
- **Estanque diario TK-103 (LIT-103) bajo:** P-501 lo rellena desde la bodega bajo 40 %. Si no sube, revisa P-501 y el stock.

## OP-5.1 · Secuencias del área 100

Las secuencias siguen ISA-106: cada paso tiene una acción, una condición de término y un tiempo máximo. Si un paso no termina, la secuencia se detiene en **FALLA** con la causa.

**Partida:** tambor M-103 → correa CV-101 → WIC-101 en manual al 75 % y alimentador FD-101 → espera mineral en el pesómetro y el tambor → WIC-101 a automático sin salto → razones de ácido y agua en cascada y bombas. Aguas abajo primero, para no cargar un equipo detenido; el ácido entra solo cuando hay mineral.

**Parada:** alimentador FD-101 → vaciar la correa (menos de 50 t/h al tambor) → bombas de ácido y agua → correa CV-101 → descargar el tambor 60 s → tambor M-103. Las alarmas del área quedan suprimidas por estado.

Ante **SEQ-100.FAIL**: lee el mensaje (por ejemplo «rearmar CV-101»), corrige la causa con OP-3.2 y vuelve a partir la secuencia.

## OP-5.2 · Secuencias de la nave (área 400)

**Puesta en servicio:** circulación de electrolito sobre 800 m³/h → TIC-403 en automático y electrolito a 38 °C o más → cobalto en automático y ≥ 110 mg/L → 52-RT cerrado → IIC-401 en automático a 10 kA y RT-401 en servicio → rampa de 2 kA/min → IIC-401 a la consigna del plan. Es la **única vía** para energizar la nave (regla S4): requiere jefe de turno.

**Protección:** baja la corriente a 5 kA en rampa. Se usa cuando SX no entrega electrolito o hay que intervenir la nave sin cortar: el cátodo sigue en grado A.

Ante **SEQ-400.FAIL**: el mensaje dice qué permisivo faltó (por ejemplo «52-RT abierto»). Resuelve y reintenta.

## OP-6.1 · Entrega de turno

1. Alarmas activas y su estado (reconocidas, archivadas con plazo).
2. Equipos fuera de servicio y avisos de mantenimiento abiertos.
3. Lazos fuera de su modo normal y por qué.
4. Cátodo del turno contra el plan, pérdidas por cortocircuitos y por rectificador.
5. Acciones aprobadas al asistente y su seguimiento (quedan en la bitácora con el rol que aprobó).
