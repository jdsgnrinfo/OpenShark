# Protocolo Attack Shark X6

Obtenido por ingeniería inversa de `Mouse.exe` v1.0 (paquete "Attack SharkX6Mouse",
Guangzhou Junxingcheng) con desensamblado estático y verificado contra un X6 real
por receptor 2.4 GHz (el ratón responde con ACK a los paquetes).

## Dispositivo

| PID      | Conexión  | Notas                                   |
|----------|-----------|-----------------------------------------|
| `1D57:FA60` | 2.4 GHz (receptor Beken) | reintentos hasta recibir ACK |
| `1D57:FA61` | Cable     | sin ACK; pausa de ~40 ms entre paquetes  |

Interfaz 2 del receptor, colecciones HID:

| Usage page | Uso                         |
|------------|-----------------------------|
| `0x0B`     | **Configuración**: Feature Reports (`HidD_SetFeature`), máx. 262 B |
| `0x0A`     | **Eventos**: Input Report `0x03` de 5 bytes |

El firmware **no** permite leer la configuración (`GetFeature` falla). La app
original guarda el estado en `%APPDATA%\Attack SharkX6Mouse\ms_1\pro.data`.

## Checksum

Suma de 16 bits de los bytes `[3 .. n)`, guardada en big-endian (alto, bajo)
justo después.

## Paquetes de salida (Feature Reports)

### `0x04` — DPI y sensor (56 bytes)

| Byte    | Contenido |
|---------|-----------|
| 0–2     | `04 38 01` |
| 3       | LOD (0 = 1 mm, 1 = 2 mm)* |
| 4       | Corrección de ondulación (0/1) |
| 5       | Máscara de niveles habilitados (bit i = nivel i) |
| 6       | Ajuste de ángulo (0/1) |
| 7       | Motion Sync (0/1) |
| 8–15    | Byte bajo de `DPI/50 − 1`, niveles 1–8 |
| 16–23   | Byte alto de `DPI/50 − 1` |
| 24      | Nivel activo (1–8) |
| 25–48   | Color RGB de cada nivel (8 × 3) |
| 49      | `01` |
| 50–51   | Checksum de `[3..50)` |

\* La app original escribe aquí el valor de "ajuste de ángulo" (igual que en el
byte 6), pero el cambio de LOD es lo que dispara el paquete. Open Shark envía el
LOD; se puede revertir con `LOD_AT_BYTE3` en `src/core/protocol/x6.js`.

### `0x05` — Iluminación, energía y antirrebote (15 bytes)

| Byte | Contenido |
|------|-----------|
| 0–2  | `05 0F 01` |
| 3    | Modo de luz `<< 4` (0 apagado … 11 marquesina 2) |
| 4    | `(reposo & 0xF0) | (9 − velocidad)` |
| 5    | `(reposo << 4) | brillo` — el brillo solo se usa en modos 1 y 9; en el resto va `8` |
| 6–8  | Color RGB |
| 9    | Minutos hasta apagar la iluminación |
| 10   | Antirrebote (valor × 2 = ms) |
| 11–12| Checksum de `[3..11)` |

### `0x06` — Frecuencia de sondeo (9 bytes)

`06 09 01 CC ~CC 00 00 00 00`, con `CC` = `08` (125 Hz), `04` (250), `02` (500), `01` (1000).

### `0x08` — Botones (59 bytes)

`08 3B 01` + 18 ranuras × 3 bytes + checksum de `[3..57)` en 57–58.

Ranuras del X6: 0 izq., 1 der., 2 rueda, 3 botón DPI, 6 lateral delantero,
7 lateral trasero. Valores de cada ranura (`b0 b1 b2`):

| b0   | Función | b0   | Función |
|------|---------|------|---------|
| `01` | Desactivado | `0D` | Ciclo DPI |
| `02` | Clic izquierdo | `0E` | DPI + |
| `03` | Clic derecho | `0F` | DPI − |
| `04` | Clic central | `10 00 03` | Easy Aim |
| `05` | Atrás | `11 MM KK` | Combinación: modificadores HID + tecla HID |
| `06` | Adelante | `12 00 NN` | Macro de la ranura NN (1-based) |
| `07` | Doble clic | `15`–`1C` | Multimedia |
| `08` | Disparo rápido | `1D`–`26` | Navegador / sistema |
| `09`/`0A` | Rueda arriba/abajo | `29 00 03` | Ciclo de iluminación |
| `0B`/`0C` | Desplazamiento izq./der. | `3C` | Cambio de modo |

La tabla completa (id de la app → bytes) está en `BUTTON_FUNCTIONS` de `x6.js`.

### `0x09` — Macro (131 bytes, enviada en 3 trozos)

| Byte | Contenido |
|------|-----------|
| 0–2  | `09 83 NN` (NN = ranura + 1) |
| 4–6  | Repeticiones (×3) |
| 7    | Modo: 1 N veces, 2 hasta otra tecla, 3 mientras se mantiene |
| 28   | Nº de pares de eventos |
| 29…  | Pares `[espera, tecla]`: `espera = round(ms/10) | 0x01` (pulsar) o `| 0x81` (soltar). Esperas > 1270 ms añaden un par extra `[ms/200, 03]` |
| 129–130 | Checksum de `[3..129)` |

Troceado: 3 reports de 64 B `09 LL NN idx` + 60 bytes de datos (desde el byte 3).
`LL` = `40`, salvo el último trozo por 2.4 GHz, que lleva `0C`.

### `0x0C` — Restaurar fábrica

`0C 0A 01 FE 01 FE 00 00 00 00`

## Eventos de entrada (Input Report `0x03`)

`03 LO HI V0 V1`, código = `HI<<8 | LO`:

| Código   | Significado |
|----------|-------------|
| `0x1010` | Nivel de DPI cambiado en el ratón (V0 = 1–8) |
| `0x2010` | Frecuencia cambiada (V0) |
| `0x4010` | Estado: V0 = 1 conectado, 2 cargando, 3 en reposo (sin cable) o carga completa (con cable: el X6 envía `03 10 40 03 0a`); V1 = batería en decenas (1–10) |
| `0x5010` | ACK del último paquete (V0 = 0 → correcto) |
| `0x7010` | Modo de luz cambiado (V0) |

## pro.data

Cabecera de 4 bytes + 6 perfiles de `0x80E0` bytes. Offsets útiles: nombre
UTF-16 en 0, DPI X `0x8C4`, DPI Y `0x8E4`, habilitados `0x904`, brillo `0x924`,
velocidad `0x928`, reposo `0x92C`, apagado de luz `0x930`, nivel activo `0x934`,
sondeo `0x938`, ondulación `0x940`, ángulo `0x944`, Motion Sync `0x948`, modo de
luz `0x94C`, antirrebote `0x958`, color `0x95C`, colores DPI `0x960`, botones
desde `0x9A0` en bloques de `0x4F8` (función en +1, tecla en +3, modificador en +7).
