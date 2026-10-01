# Editor visual de scripts por nodos

Aplicación web local para crear y ejecutar scripts mediante nodos conectados visualmente. El proyecto combina una interfaz en Flask/JavaScript con un motor de ejecución en Python. Las conexiones representan flujo de ejecución o transferencia de datos entre nodos.

## Requisitos

- Python 3.10 o posterior.
- Un navegador moderno.
- Windows es compatible. Los nodos que automatizan el ratón y el teclado actúan sobre el escritorio del equipo donde se ejecuta el servidor.

## Instalación y puesta en marcha

Desde la carpeta raíz del proyecto, crea un entorno virtual e instala las dependencias:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Si PowerShell impide activar el entorno virtual, puedes ejecutar los comandos usando directamente `\.venv\Scripts\python.exe`.

Inicia la aplicación:

```powershell
python main.py
```

Abre [http://127.0.0.1:5000](http://127.0.0.1:5000) en el navegador. Para detener el servidor, pulsa `Ctrl+C` en la terminal.

## Uso

1. Al abrir la aplicación se carga un proyecto con un nodo `Start`, que es el inicio del flujo y no se puede eliminar.
2. Haz doble clic en una zona vacía del lienzo para abrir el buscador de nodos. Selecciona uno para añadirlo.
3. Arrastra un puerto de salida hasta un puerto de entrada compatible para crear una conexión. También puedes arrastrar un puerto hasta una zona vacía y elegir un nodo: la aplicación lo añade y conecta automáticamente un puerto compatible.
4. Selecciona un nodo para editar su configuración en el inspector. Las entradas pueden recibir valores desde otro nodo o, cuando corresponda, desde la propia configuración.
5. Conecta la salida de ejecución de `Start` (o la salida de otro nodo de ejecución) con la entrada de ejecución del siguiente nodo para definir el orden de las acciones. Las conexiones de datos proporcionan valores, pero no inician por sí mismas un nodo de ejecución.
6. Pulsa **Ejecutar todo**. Los errores de configuración o de conexión se muestran en la interfaz y bloquean la ejecución hasta corregirlos. La consola de la aplicación muestra los mensajes emitidos por los nodos.

Los proyectos se guardan automáticamente en `data/projects.json`. El botón `+` permite crear proyectos e importar JSON. Desde el menú contextual de una pestaña puedes renombrar, duplicar, exportar o eliminar un proyecto. Para editar nodos puedes moverlos, redimensionarlos y configurar sus puertos; `Ctrl+C`, `Ctrl+V` y `Ctrl+D` copian, pegan y duplican el nodo seleccionado, y `Supr` lo elimina.

## Crear un nodo personalizado

Cada nodo es una clase Python que hereda de `BaseNode` y declara un `NodeDef`. La definición describe el identificador del tipo, el título que verá el usuario, la descripción, los puertos y los campos de configuración. La interfaz obtiene estas definiciones del registro del backend.

1. Crea un archivo en `nodes/`, por ejemplo `nodes/mi_nodo.py`.
2. Define una clase que herede de `BaseNode`. Implementa `evaluate_output` si el nodo ofrece salidas de datos y `execute` para su comportamiento al ejecutarse. Los nodos que solo calculan datos pueden dejar `execute` sin acciones.
3. Registra la clase en `nodes/registry.py`: importa el nodo y añade su clase al diccionario que devuelve `get_node_registry()`.
4. Reinicia el servidor para que cargue el nuevo registro. El nodo aparecerá en el buscador de la interfaz.

Ejemplo de nodo que imprime un mensaje y continúa el flujo:

```python
from typing import Any

from .base import (
    BaseNode,
    ConfigField,
    ExecFire,
    NodeDef,
    NodeInstance,
    PortDef,
    ResolveContext,
    RouteType,
)


class MiNodo(BaseNode):
    definition = NodeDef(
        type="mi_nodo",
        title="Mi nodo",
        description="Muestra un mensaje y continúa el flujo.",
        inputs=[PortDef("exec_in", "in", RouteType.EXEC, required=True)],
        outputs=[PortDef("exec_out", "out", RouteType.EXEC)],
        config_fields=[
            ConfigField(
                key="mensaje",
                label="Mensaje",
                type="string",
                default="Hola desde mi nodo",
            )
        ],
    )

    @classmethod
    def evaluate_output(
        cls,
        node: NodeInstance,
        output_port: str,
        *,
        ctx: ResolveContext,
    ) -> Any:
        raise ValueError("Mi nodo no tiene salidas de datos")

    @classmethod
    def execute(
        cls,
        node: NodeInstance,
        *,
        triggered: bool,
        ctx: ResolveContext,
        fire: ExecFire,
        emit_console,
        emit_notification,
    ) -> None:
        emit_console(str(node.config.get("mensaje", "")))
        fire.fire("exec_out")
```

Añade el import y la entrada al registro explícito de `nodes/registry.py`:

```python
from .mi_nodo import MiNodo


def get_node_registry():
    return {
        # ...nodos existentes...
        MiNodo.definition.type: MiNodo,
    }
```

En el proyecto real, conserva las anotaciones de tipo y el resto de entradas ya existentes del registro; el fragmento solo muestra la línea que hay que añadir.

### Contrato del nodo

- `NodeDef.type` debe ser único: se usa como identificador interno del nodo.
- Cada `PortDef` declara nombre, dirección (`"in"` o `"out"`), tipo y si la entrada es obligatoria. Los tipos disponibles son `BOOLEAN`, `LIST`, `INT`, `FLOAT`, `STRING`, `EXEC`, `BYTES`, `IMAGE`, `VECTOR2` y `ANY`.
- `ConfigField` crea un control editable en el inspector. Los tipos admitidos por la interfaz son `string`, `int`, `float`, `boolean` y `select`; para `select`, define `options` con pares `label` y `value`.
- `ctx.input_value(node, port, default=...)` resuelve primero una conexión entrante y, si no existe, usa la configuración del mismo nombre. Para entradas de datos obligatorias, el validador acepta una conexión o un valor configurado.
- `evaluate_output` calcula el valor de un puerto de salida de datos. Usa `ctx.input_value` para leer entradas y devuelve un valor compatible con el tipo declarado.
- `execute` se invoca durante la ejecución del grafo. Usa `fire.fire("nombre_salida")` para disparar una salida de ejecución, `emit_console(mensaje)` para escribir en la consola de la app y `emit_notification(mensaje)` para enviar una notificación.
- Sobrescribe `validate_instance` para validar configuraciones o restricciones entre puertos. Devuelve una lista de `ValidationError`.

Puedes consultar `nodes/print_node.py` para un nodo de acción y `nodes/math_expr.py` para un nodo que calcula una salida de datos.

## Nodos incluidos

El registro incluye nodos de inicio, condicional, bucle, expresión matemática, variable, conversión a texto, impresión, alerta, retardo, captura de pantalla, reconocimiento OCR, clic de ratón y escritura de teclado. Algunos dependen de capacidades del sistema operativo. `easyocr` puede descargar modelos durante su primer uso; los nodos de ratón y teclado requieren permiso para interactuar con el escritorio.

## Estructura del proyecto

- `main.py`: servidor Flask, almacenamiento de proyectos, validación y motor de ejecución.
- `nodes/`: definiciones, implementación y registro de nodos.
- `templates/` y `static/`: interfaz web.
- `data/projects.json`: proyectos guardados localmente.
