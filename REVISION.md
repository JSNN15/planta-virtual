# Revisión de ingeniería y metalurgia · Planta virtual LX-SX-EW (OTS)

Revisión del motor de simulación (`sim.js`) y de su interfaz, noviembre de 2026. No cubre los otros proyectos del portafolio.

Los valores de este documento salen del propio motor, en régimen tras 24 h simuladas sin intervención. Se reproducen con `node test/sim.test.js` y con el script de análisis descrito al final.

## 1. Resumen

- **Veredicto.** Los balances de cobre, ácido y agua cierran, y los parámetros caen dentro de rangos industriales publicados. La dinámica es creíble para entrenar operadores: partidas, paradas, fallas y su efecto en producción, energía y calidad. No sirve para diseñar ni para predecir una faena concreta.
- **Correcciones de esta revisión** (detalle en la sección 6):
  - Inventario de electrolito de 600 a 1.800 m³, con resintonía del lazo AIC-405.
  - Cobalto, hierro y stock de ácido que derivaban por partir fuera de régimen o por un balance mal cerrado.
  - Zonas de vibración aplicadas a todos los motores como si fueran del grupo 1.
  - Filtro de armónicos mal especificado para un rectificador de 12 pulsos.
  - Nivel fijo del estanque de electrolito.
  - Una alarma molesta durante la corriente baja deliberada.
- **Nuevo en esta revisión.** Puesta en servicio de la nave EW y parada a corriente de protección, con el efecto metalúrgico de un corte de corriente: el cobre se acumula en el electrolito y el cátodo sale con plomo al volver la corriente.
- **Tres limitaciones mayores** (sección 7):
  - Electrolito como un solo estanque bien mezclado.
  - Pilas sin retención de solución.
  - Electrolito sin especiación de hierro ni manganeso.

## 2. Base de diseño y chequeos de consistencia

| Magnitud | Modelo | Referencia o rango industrial | Juicio |
|---|---|---|---|
| Mineral a aglomeración | 1.700 t/h, 0,6 % Cu (≈ 15 Mt/año) | Planta LX-SX-EW mediana | Consistente |
| Recuperación de óxidos a 90 días | 64,6 % | ENAMI (Saldaña y otros, 2019) | Dato publicado |
| Cobre que entregan las pilas | 6,59 t/h | 10,2 t/h × 64,6 % | Cierra |
| Cátodo | 6,28 t/h ≈ 150 t/día ≈ 55 kt/año | Igual orden que el balance del capítulo 6 del curso | Consistente |
| Dosis de ácido de curado | 20,0 kg/t | 15 a 35 kg/t | Dentro del rango |
| Humedad del aglomerado | 9,2 % | 8 a 12 % | Dentro del rango |
| Tasa de riego | 10 L/h/m² → 220.000 m² bajo riego | 5 a 15 L/h/m² (León y otros, 2025) | Dentro del rango |
| Mineral bajo riego (90 días) | 3,7 Mt → pila de ≈ 10 m con 1,7 t/m³ | Alturas de 6 a 10 m | En el límite alto |
| Razón solución/mineral | 1,3 m³/t | 1 a 3 m³/t | Dentro del rango |
| PLS | 3,34 g/L Cu, pH 1,9 | Promedios sudamericanos (Sole y otros, 2012) | Dato publicado |
| Extracción SX (2E + 1S) | 92,6 %, refino 0,25 g/L | 90 a 95 % con dos etapas | Dentro del rango |
| Orgánico cargado / descargado | 5,75 / 2,32 g/L con extractante al 15,4 % v/v | Transferencia neta 0,2 a 0,28 g/L por % v/v | 0,22: dentro del rango |
| Carga del orgánico | 62 % de la carga máxima (9,24 g/L) | 60 a 80 % | Dentro del rango |
| Densidad de corriente | 294 a 305 A/m² | 250 a 330 A/m² (cátodo permanente) | Dentro del rango |
| Voltaje de celda sana | 1,95 V (0,89 reversible + 0,62 anódico + 0,08 catódico + 0,21 óhmico + 0,15 conexiones) | 1,9 a 2,1 V (Cifuentes y otros) | Dentro del rango |
| Eficiencia de corriente sin cortocircuitos | 94,9 % | 88 a 95 % | Optimista pero alcanzable |
| Energía específica | 1,71 MWh/t DC; 2,16 MWh/t toda la planta | 1,8 a 2,2 MWh/t DC | Extremo bajo |
| Electrolito | 44 g/L Cu, 182 g/L H₂SO₄, 0,70 g/L Fe, 150 mg/L Co, 45 °C | Cu 37 a 48, ácido 160 a 190, Fe 1 a 2, Co 100 a 200, 45 a 50 °C | Fe en el extremo bajo |
| Balance de cobre | Pilas 6.589 kg/h = cátodo 6.283 + sangrado 308 kg/h | Cierre exacto en régimen | Cierra (< 0,1 %) |
| Balance térmico de la nave | Celdas 2,7 MW + HX-401 2,2 MW = pérdidas 4,9 MW a 45 °C | Calor por sobre el voltaje termoneutro ≈ 25 a 30 % de la potencia DC | Consistente |
| Balance de ácido de bodega | Consumo 34 t/h; abastecimiento 34,5 t/h | Debe cerrar en régimen | Corregido en esta revisión |

## 3. Revisión por área

### 100 · Aglomeración y curado

**Lo que está bien**
- La razón ácido/mineral y agua/mineral va en cascada sobre el pesómetro, y se compensa el retardo de la correa.
- Los enclavamientos siguen el orden real: tambor, luego correa, luego alimentador.
- Las secuencias de partida y parada vacían la correa antes de cortar el ácido.

**Hallazgos**
- La compensación de retardo usaba 25 s en vez de 45 s, y el ácido llegaba antes que el mineral. Se corrigió en la revisión anterior y hay una prueba que lo cubre.
- El abastecimiento de ácido (1 camión de 30 t por hora) no cubría el consumo (34 t/h): el stock caía 4,3 t/h sin que nadie hiciera nada. Corregido a 1,15 camiones por hora.
- La partida secuencial ponía WIC-101 en automático con el pesómetro todavía en cero. El error de 68 % y la acción proporcional llevaban el alimentador al 100 %, y el tonelaje subía a 2.264 t/h (+33 %). Ahora el lazo espera en manual al 75 % hasta que el pesómetro y el tambor miden mineral, y recién entonces pasa a automático sin salto (práctica de ISA-106). El máximo baja a 1.904 t/h, dentro de la variación normal del mineral.

**Faltan**
- Tiempo de reposo del aglomerado antes del riego.
- Efecto de los finos y la humedad en la permeabilidad de la pila.
- Medición de la calidad del aglomerado.

### 200 · Lixiviación en pilas y piscinas

**Lo que está bien**
- Tres sectores por edad del mineral (0 a 30, 30 a 60 y 60 a 90 días), cada uno con la recuperación incremental de la curva de ENAMI.
- El efecto del riego sobre la extracción es sublineal (exponente 0,4). Por eso, al bajar el caudal, la concentración del PLS sube: el comportamiento esperado en una lixiviación controlada por difusión.
- La piscina de PLS funciona como pulmón, con LIC-204 en manual. Es la práctica correcta: caudal constante a SX y nivel flotante.

**Hallazgos**
- Falta la retención de solución en la pila. La ley del PLS responde con una constante de 30 min; una pila real tarda días, entre drenaje y una humedad retenida de 8 a 12 %. Los escenarios de mineral y de riego llegan al PLS más rápido que en la realidad.
- La acidez del PLS es un ajuste empírico sobre la dosis de curado. No hay balance de ácido en la pila: consumo de la ganga, regeneración en SX y acumulación en el refino.
- No hay acumulación de impurezas en el circuito de refino (Fe, Al, Mg, Cl, Mn). Esa acumulación es la que fija en la práctica el sangrado y la calidad del PLS.

### 300 · Extracción por solventes

**Lo que está bien**
- Etapas de equilibrio con liberación de ácido en cada etapa, resueltas numéricamente en contracorriente: el modelo del capítulo 4 del curso.
- Razón O/A en cascada con el caudal de PLS.
- Transferencia química de hierro con selectividad Cu/Fe de 2.000:1.
- La borra aumenta el arrastre de acuoso hacia el electrolito.

**Hallazgos**
- Las etapas son 100 % eficientes. Una etapa real rinde 90 a 98 %.
- No hay arrastre de orgánico al refino, que es una pérdida de extractante con costo directo.
- La reextracción se modela como equilibrio con la acidez del electrolito, pero no tiene caudal ni razón O/A propios. Tampoco existe el caudal de electrolito de avance.
- No hay efecto de la temperatura ni de la degradación del orgánico, por ejemplo por manganeso.

### 400 · Electroobtención

**Lo que está bien**
- Ley de Faraday con 1,1855 g/Ah.
- Voltaje de celda descompuesto en sus partes, con la conductividad dependiente de la temperatura.
- Cortocircuitos cuya tasa crece con la densidad de corriente.
- Eficiencia de corriente penalizada por hierro, frío y cortocircuitos.
- Calidad del cátodo frente a la LME grado A.
- Balance térmico con intercambiador.

**Hallazgos corregidos**
- **Inventario de electrolito.** Era de 600 m³. Una nave de 160 celdas de 60 cátodos de 1 m² tiene unos 8 m³ por celda (1.280 m³), más estanques, filtros e intercambiadores: del orden de 1.800 m³.
  - Con 600 m³, la concentración de cobre, el hierro y la temperatura respondían tres veces más rápido que en la realidad.
  - Al corregirlo, la sintonía anterior de AIC-405 (Kp 4, Ti 2.400 s) hacía oscilar la corriente entre 22 y 41 kA ante un cambio de consigna de 2 g/L.
  - La nueva sintonía (Kp 6, Ti 6.000 s) la mantiene entre 21,5 y 37 kA, con 0,65 g/L de sobrepaso.
- **Cobalto fuera de régimen.** Partía en 150 mg/L, pero la dosificación de 45 L/h lo llevaba a 128 mg/L. Ahora la consigna es 52,5 L/h: 52,5 L/h × 20 g/L ÷ 7 m³/h de sangrado = 150 mg/L.
- **Hierro fuera de régimen.** Partía en 0,80 g/L con un régimen de 0,70 g/L. Ahora parte en 0,70 g/L.
- **Nivel del estanque de electrolito.** Estaba fijo en 70 %, y el disparo de las bombas por nivel bajo era código muerto. Ahora el nivel sube cuando se detiene el bombeo, porque las cañerías de retorno drenan al estanque.
- **Alarma molesta.** "Corriente baja en la nave" se activaba durante la corriente de protección y la rampa de puesta en servicio, que son deliberadas. Ahora se suprime por estado.

**Nuevo: puesta en servicio y parada controlada**
- **Puesta en servicio** (7 pasos):
  1. Circulación de electrolito.
  2. Temperatura de 38 °C o más.
  3. Cobalto de 110 mg/L o más, para proteger el ánodo.
  4. Interruptor 52-RT cerrado.
  5. Rectificador en servicio a 10 kA.
  6. Rampa de 2 kA/min hasta 37 kA.
  7. Paso sin salto del lazo de corriente a cascada con AIC-405.
- **Parada a corriente de protección:** rampa a 5 kA, manteniendo circulación y temperatura.

**Nuevo: efecto metalúrgico de un corte de corriente**
- **Acumulación de cobre.** SX sigue transfiriendo 6,4 t/h y el cobre se acumula: con 1.800 m³, sube de 44 a 51 g/L en 2 h.
- **Plomo en el cátodo.** Sin corriente, la capa de PbO₂ del ánodo se reduce. Al reenergizar se desprenden partículas con plomo que el cátodo atrapa.
  - En el modelo, un corte de 2 h deja el cátodo 1,8 h fuera de norma, con un máximo de 6,2 ppm de Pb.
  - Con corriente de protección el cátodo se mantiene en grado A.
  - El efecto es conocido; **su magnitud es ilustrativa**, no está calibrada con datos.

**Faltan**
- **Electrolito único y bien mezclado.** En una nave real el electrolito rico entra a unos 48 a 50 g/L y el pobre sale a 35 a 38 g/L. El modelo usa un promedio.
- **Hierro sin especiar.** Lo que gasta corriente es la reducción de Fe³⁺, y la razón Fe³⁺/Fe²⁺ depende del potencial y del manganeso.
- **Manganeso y cloruro.**
  - El manganeso forma permanganato, que degrada el orgánico y afecta al ánodo.
  - El cloruro, sobre unos 30 mg/L, pica el cátodo permanente de acero inoxidable y libera cloro en el ánodo.
- **Aditivos y orgánico.** No hay aditivos (guar, que mejora la morfología del depósito) ni "quemado" del cátodo por orgánico arrastrado.
- **Ciclo de cosecha.** No existe el ciclo de 6 a 7 días de depósito ni la calidad por lote cosechado.
- **Rondas que solo detectan.** Las rondas manuales detectan cortocircuitos pero no los corrigen. Si nadie los manda a corregir, la eficiencia de corriente baja de 94,9 % a 91,7 % en 72 h. Es una decisión didáctica (la planta desatendida se degrada); en una nave real la cuadrilla de rondas detecta y corrige en el mismo recorrido.

### 500 · Servicios y energía

**Hallazgos corregidos**
- **Filtro de armónicos.** Un rectificador de 12 pulsos cancela las armónicas 5.ª y 7.ª, y sus armónicas características son 12k ± 1 (11.ª, 13.ª, 23.ª, 25.ª…). El texto decía "filtro de 5.ª y 7.ª"; ahora dice 11.ª y 13.ª. La distorsión de 8,5 % sin filtro y 3,1 % con filtro es plausible.
- **Zonas de vibración por grupo.** Todos los motores usaban las zonas del grupo 1 de ISO 10816-3 (2,3 · 4,5 · 7,1 mm/s), incluidas bombas de 15 a 250 kW, que son del grupo 2 (1,4 · 2,8 · 4,5 mm/s).
  - Ahora cada motor usa las zonas de su grupo: grupo 1 sobre 300 kW, grupo 2 de 15 a 300 kW.
  - El disparo queda en 1,25 veces el límite C/D.
  - La vista de mantenimiento muestra el grupo de cada equipo.

**Faltan**
- Ángulo de disparo y cambiador de derivaciones del rectificador. El factor de potencia de 0,86 es un valor fijo, no resultado del ángulo.
- Pérdidas en barras y transformador.
- Coordinación de protecciones.

## 4. Control y automatización

| Lazo | Evaluación |
|---|---|
| WIC-101 (tonelaje) | PI sobre un proceso dominado por 20 s de tiempo muerto. En la partida espera en manual hasta tener medición (corregido en esta revisión). |
| FFIC-102 y FFIC-104 (razones) | Cascada con compensación de retardo: práctica correcta, y ahora con el retardo correcto. |
| FIC-211 a 213 (riego) | Hidráulica de cabezal con curva de bomba. Responde bien. |
| LIC-204 / FIC-205 | Nivel promediante, con el lazo de nivel en manual y caudal constante a SX. Correcto. |
| FFIC-301 (O/A) | Cascada con el caudal de PLS. Correcto. |
| AIC-405 → IIC-401 | La corriente sigue a la transferencia de SX. Es una elección de diseño válida. La alternativa común es fijar la corriente por plan de producción y controlar el cobre con el caudal de avance o la reextracción. Resintonizado para 1.800 m³. |
| TIC-403 | Proceso lento (constante térmica ≈ 12 h). PI adecuado. |

**Robustez**
- Los PID son posicionales, con antisaturación y cambio de modo sin salto.
- Las secuencias de la nave fuerzan el cambio sin salto de AIC-405 al volver a cascada. Sin esto, la integral acumulada durante la parada habría pedido 45 kA de golpe.

## 5. Alarmas

**Qué tiene**
- 38 alarmas analógicas y 57 discretas (disparos, vibración, interruptores y secuencias), más una por celda si se activa el monitoreo continuo. Todas con prioridad y retardo; las analógicas, además, con banda muerta. Hay inhibición temporal y supresión por estado de equipo (ISA-18.2).
- En 24 h de régimen sin intervención no se activa ninguna alarma nueva. Los escenarios generan avalanchas a propósito: la caída del MCC-200, por ejemplo.
- La planta parte con una alarma permanente: factor de potencia bajo, porque el filtro y los condensadores están fuera de servicio. Es un ejercicio (ponerlos en servicio), pero ISA-18.2 trata las alarmas permanentes como un problema. Conviene presentarla al alumno como tarea explícita.

**Falta la base maestra de alarmas.** ISA-18.2 pide, por cada alarma, su causa, su consecuencia, la acción del operador y el tiempo disponible para responder. El modelo ya tiene la estructura para agregarla.

## 6. Correcciones aplicadas en esta revisión

| Hallazgo | Impacto | Corrección | Prueba |
|---|---|---|---|
| Inventario de electrolito de 600 m³ | Dinámica de Cu, Fe y temperatura tres veces más rápida | 1.800 m³ y AIC-405 en Kp 6, Ti 6.000 s | Régimen de 72 h y puesta en servicio |
| Cobalto en 150 mg/L, régimen en 128 mg/L | Deriva sin causa operacional | FIC-404 en 52,5 L/h | Régimen de 72 h |
| Hierro en 0,80 g/L, régimen en 0,70 g/L | Deriva sin causa operacional | Parte en 0,70 g/L | Régimen de 72 h |
| Ácido: abastecimiento menor que consumo | Stock cae 4,3 t/h | 1,15 camiones por hora | Régimen de 72 h |
| Zonas de vibración del grupo 1 en todos los motores | Bombas pequeñas evaluadas con límites holgados | Zonas por grupo y disparo a 1,25 × C/D | Zonas por grupo sin alarmas en régimen |
| Filtro de 5.ª y 7.ª en un rectificador de 12 pulsos | Error técnico visible | 11.ª y 13.ª | Revisión visual |
| Nivel de TK-401 fijo | Código muerto en el disparo de bombas | Nivel dinámico por drenaje de retorno | Recorrido de pantallas |
| Alarma de corriente baja en protección | Alarma molesta | Supresión por estado | Puesta en servicio |
| Sin puesta en servicio de la nave | Faltaba el procedimiento crítico de EW | Secuencias de puesta en servicio y protección | 3 pruebas nuevas |
| WIC-101 en automático sin medición al partir | Tonelaje a 2.264 t/h (+33 %) | Manual hasta medir mineral, luego automático sin salto | Secuencias del área 100 |

## 7. Limitaciones y siguientes pasos, en orden de prioridad

1. **Electrolito rico y pobre**, con reextracción explícita (O/A de reextracción y caudal de avance). Es la mayor ganancia de fidelidad metalúrgica.
2. **Retención de solución en las pilas**, para que el PLS responda en días y no en horas.
3. **Hierro como Fe³⁺/Fe²⁺, y manganeso**, para modelar mejor la eficiencia de corriente y la degradación del orgánico.
4. **Ciclo de cosecha de cátodos**, con calidad por lote.
5. **Evaluación del alumno.** Es lo que distingue a un OTS de un simulador: puntaje por ejercicio según el tiempo para normalizar, las toneladas fuera de norma, las alarmas atendidas y los errores de maniobra.
6. **Base maestra de alarmas** según ISA-18.2.
7. **Calibración con datos de planta** (CSV del historiador, luego OPC UA), para pasar de modelo digital a sombra digital.

## Cómo verificar

```bash
node test/sim.test.js
```

Las 13 pruebas cubren:
- el régimen de diseño, la ley de Faraday y el voltaje de celda;
- que todos los escenarios corran 6 h sin valores no finitos;
- el cordón de emergencia;
- las secuencias de las áreas 100 y 400, y sus fallas con causa;
- el plomo tras un corte;
- la supresión de alarmas y las zonas de vibración;
- la compensación de retardo;
- que el régimen de 72 h no derive.
