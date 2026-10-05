from __future__ import annotations

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
    ValidationError,
)


BASIC_TYPES = ("string", "int", "float", "boolean")


def _coerce_basic(kind: str, value: Any) -> Any:
    if kind == "string":
        return "" if value is None else str(value)
    if kind == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, str) and value.strip().lower() in ("true", "false"):
            return value.strip().lower() == "true"
        raise ValueError(f"'{value}' no es un booleano válido")
    if kind == "int":
        if isinstance(value, int) and not isinstance(value, bool):
            return value
        if isinstance(value, float) and value.is_integer():
            return int(value)
        if isinstance(value, str):
            try:
                return int(value.strip())
            except ValueError:
                pass
        raise ValueError(f"'{value}' no es un entero válido")
    if kind == "float":
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value.strip())
            except ValueError:
                pass
        raise ValueError(f"'{value}' no es un decimal válido")
    raise ValueError(f"Tipo básico desconocido: {kind}")


def _coerce_entry(entry: Any) -> Any:
    if not isinstance(entry, dict):
        raise ValueError("Entrada de lista o diccionario inválida")
    kind = entry.get("type")
    if kind not in BASIC_TYPES:
        raise ValueError(f"Tipo no permitido en este nivel: {kind}")
    return _coerce_basic(kind, entry.get("value"))


def _build_dict(entries: Any) -> dict[str, Any]:
    if not isinstance(entries, list):
        raise ValueError("El diccionario debe definirse como lista de entradas")
    result: dict[str, Any] = {}
    for entry in entries:
        key = entry.get("key") if isinstance(entry, dict) else None
        if not isinstance(key, str) or key == "":
            raise ValueError("Las claves del diccionario no pueden estar vacías")
        if key in result:
            raise ValueError(f"Clave duplicada en el diccionario: '{key}'")
        result[key] = _coerce_entry(entry)
    return result


def build_variable_value(config: dict[str, Any]) -> Any:
    var_type = config.get("var_type") or "string"
    raw = config.get("op")

    if var_type in BASIC_TYPES:
        return _coerce_basic(var_type, raw)
    if var_type == "dict":
        return _build_dict([] if raw is None else raw)
    if var_type != "list":
        raise ValueError(f"Tipo de variable desconocido: {var_type}")

    items = [] if raw is None else raw
    if not isinstance(items, list):
        raise ValueError("La lista debe definirse como un array")
    subtype = config.get("list_subtype") or "string"
    if subtype in BASIC_TYPES:
        return [_coerce_basic(subtype, item) for item in items]
    if subtype == "list":
        result = []
        for inner in items:
            if not isinstance(inner, list):
                raise ValueError("Cada elemento de la lista debe ser una lista")
            result.append([_coerce_entry(entry) for entry in inner])
        return result
    if subtype == "dict":
        return [_build_dict(inner) for inner in items]
    raise ValueError(f"Subtipo de lista desconocido: {subtype}")


def _type_option(value: str) -> dict[str, Any]:
    return {"label": value, "value": value, "set_outputs": {"result": value}}


class VariableNode(BaseNode):
    definition = NodeDef(
        type="variable",
        title="Variable",
        description="Nodo que representa una variable de un tipo concreto (string, int, float, boolean, list o dict).",
        inputs=[
        ],
        outputs=[PortDef("result", "out", RouteType.ANY)],
        config_fields=[
            ConfigField(
                key="var_type",
                label="Tipo",
                type="select",
                default="string",
                required=True,
                options=[_type_option(t) for t in (*BASIC_TYPES, "list", "dict")],
            ),
            ConfigField(
                key="list_subtype",
                label="Subtipo de la lista",
                type="select",
                default="string",
                options=[{"label": t, "value": t} for t in (*BASIC_TYPES, "list", "dict")],
                visible_when={"var_type": ["list"]},
            ),
            ConfigField(
                key="op",
                label="Valor",
                type="typed_value",
                default="",
                required=True
            )
        ],
    )

    @classmethod
    def validate_instance(cls, node: NodeInstance, *, get_incoming_edge, get_def) -> list[ValidationError]:
        try:
            build_variable_value(node.config)
        except ValueError as ex:
            return [ValidationError(node_id=node.id, message=str(ex))]
        return []

    @classmethod
    def evaluate_output(cls, node: NodeInstance, output_port: str, *, ctx: ResolveContext) -> Any:
        if output_port != "result":
            raise ValueError("Salida desconocida")
        return build_variable_value(node.config)

   
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
        # Nodo sin ruta de ejecución: no se ejecuta en modo 'exec'.
        return
