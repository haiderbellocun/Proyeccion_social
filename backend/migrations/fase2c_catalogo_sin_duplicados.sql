-- Evita que una ejecucion repetida del seed historico duplique el catalogo.
DELETE FROM catalogo_entregables actual
USING catalogo_entregables anterior
WHERE actual.id > anterior.id
  AND actual.seccion = anterior.seccion
  AND actual.entidad_numero IS NOT DISTINCT FROM anterior.entidad_numero
  AND actual.entregable = anterior.entregable
  AND actual.descripcion IS NOT DISTINCT FROM anterior.descripcion
  AND actual.orden = anterior.orden;

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalogo_entregables_contenido
  ON catalogo_entregables (
    seccion,
    COALESCE(entidad_numero, -1),
    entregable,
    orden
  );
