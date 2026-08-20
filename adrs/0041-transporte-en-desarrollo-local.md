# ADR 0041: En desarrollo el proceso escucha en claro, atado a loopback

## Estado

Aceptado — **precisa ADR-0037 §4** y, con eso, cómo se lee ADR-0033 en una máquina de desarrollo.

## Contexto

ADR-0033 exige que **el backend no escuche en claro** y que una petición HTTP *se rechace y no se
redirija*. ADR-0037 §4 estableció que esa frase se lee **sobre la interfaz pública**: la plataforma
termina el TLS y el proceso Node recibe tráfico ya descifrado desde su borde.

En una máquina de desarrollo no hay plataforma, y ningún documento dijo qué pasa entonces. El hueco no
es teórico: sin resolverlo, el primer `dev` del proyecto no tiene forma definida de arrancar, y con TDD
estricto eso bloquea la primera prueba.

Las formas de tener TLS local tienen un problema en común: **reintroducen la CA local y el almacén de
confianza que ADR-0037 acaba de eliminar**, que era el punto de esa decisión.

## Decisión

**En desarrollo el proceso escucha HTTP plano, atado exclusivamente a loopback (`127.0.0.1`), nunca a
`0.0.0.0`.**

Con esto **la forma del proceso queda idéntica en los dos entornos**: el proceso Node no termina TLS ni
en producción ni en desarrollo. No hay una ruta de código que exista solo en una máquina, que es donde
suelen esconderse las diferencias que se descubren tarde.

## Alternativas consideradas

- **Certificado local con `mkcert`** — permite verificar el comportamiento de las cookies `Secure` en
  desarrollo, que es una ventaja real. No se eligió porque instala una CA en el almacén de confianza de
  la máquina: exactamente la pieza que ADR-0037 eliminó, reintroducida por la puerta de atrás y sin
  ninguna decisión que la respalde.

- **Un proxy inverso local (Caddy o similar) que termine TLS** — mismo beneficio, y además se parece
  más a la topología de producción. No se eligió por la misma razón que el anterior, más una pieza extra
  que hay que instalar, configurar y mantener para desarrollar.

## Consecuencias

- **Todos los criterios del ítem #1 son verificables localmente**: origen único, las cuatro rutas, ida y
  vuelta de tRPC, rechazo por `Origin`, migraciones y bind a loopback.

- **Costo: el comportamiento de `Secure` y `SameSite` no es verificable en desarrollo.** El ítem #1 no
  emite ninguna cookie, así que no le falta nada; pero **la obligación de verificarlas es de los ítems
  #3 y #5**, y queda registrada en sus filas del `BACKLOG.md` para que no se pierda.

- **Costo: el rechazo real del tráfico en claro en el origen público es de la plataforma**, y no se
  verifica desde este repositorio. Lo que la suite puede probar es que el proceso escucha solo en
  loopback y que no emite una redirección. Queda declarado, no disimulado.

- **Costo: atar a loopback impide probar desde otro dispositivo de la red** —un teléfono, una tablet—
  sin cambiar la configuración a mano. Es deliberado: un bind a `0.0.0.0` en desarrollo expone en claro
  las credenciales de las tres capas de ADR-0031 en cualquier red donde esté la máquina.
