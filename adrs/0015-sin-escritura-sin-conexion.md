# ADR 0015: Las estaciones no escriben sin conexión

## Estado

Aceptado

## Contexto

La garantía de que el KDS no pierda comandas quedó resuelta en ADR-0008 y ADR-0009. Falta el sentido
contrario: qué hace una estación que pierde conexión mientras arma un pedido.

Los dos casos no son simétricos. El KDS **recibe**, y recibir tarde es seguro porque la comanda ya
existe en el servidor. La estación **envía**, y enviar contra un servidor que no se ve es donde
aparecen los problemas de divergencia.

## Decisión

Sin escritura sin conexión. Si la estación no ve el servidor, avisa y bloquea el envío. El mesero
espera o usa otra de las tres estaciones.

## Alternativas consideradas

- **Cola de salida en el cliente**, con reenvío al reconectar — viable y no frena al mesero durante
  cortes cortos, que son los más frecuentes. No se eligió porque un pedido en cola se confirmaría
  contra un stock que ya pudo cambiar, reintroduciendo exactamente la divergencia que ADR-0013 elimina,
  y porque obliga a hacer idempotente todo el camino de envío para que un reintento no duplique la
  comanda en cocina.

## Consecuencias

- Coherente con la fuente única de verdad: no existe un estado local que pueda contradecir al servidor.
- Costo: un corte de red deja la estación inutilizable para tomar pedidos. El PRD ya asume la red local
  como un requisito no funcional fuera del control del producto, pero esta decisión la convierte en una
  dependencia dura de la operación en vez de una degradación tolerable.
- Costo: la contingencia efectiva pasa a ser humana —usar otra estación, o esperar y anotar en papel—.
  No hay mitigación técnica, a diferencia del KDS, que sí tiene la suya.
