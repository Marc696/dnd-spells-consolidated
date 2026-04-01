# D&D 5e Spells - Consolidated Database

Base de datos consolidada de conjuros de D&D 5e en español, con datos de dados de efecto incluidos.

## Fuentes

1. **Jtachan/DnD-5.5-Spells-ES** — Conjuros en español (fuente principal)
2. **Open5e API** — SRD oficial en inglés (rellena huecos)
3. **dnd5eapi.co** — API de D&D 5e en inglés (rellena huecos restantes)
4. **Marc696/dados_efecto** — Datos de dados de efecto/daño

## Cómo funciona

El archivo `build_spells_repo.js` se ejecuta automáticamente vía GitHub Actions. Descarga las 4 fuentes, las fusiona, deduplica, y genera:

- `spells_consolidated.json` — versión legible (con formato)
- `spells_consolidated.min.json` — versión minificada (para producción)

## Uso

```
https://raw.githubusercontent.com/Marc696/dnd-spells-consolidated/main/spells_consolidated.min.json
```

## Regenerar

Para regenerar el JSON, ve a la pestaña **Actions** del repo y ejecuta manualmente el workflow "Build Consolidated Spells JSON", o simplemente haz push de cualquier cambio a `build_spells_repo.js`.
