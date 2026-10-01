# Nodos

Cada nodo vive en su propio script dentro de esta carpeta.

- Añade un nuevo archivo `mi_nodo.py` con una clase que herede de `BaseNode`.
- Regístralo en `nodes/registry.py` dentro de `get_node_registry()`.

El backend expone las definiciones de nodos en `/api/node_types` para que la UI pueda construir el menú de creación y el panel de configuración.
