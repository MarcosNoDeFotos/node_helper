from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Iterable, Literal


class RouteType(str, Enum):
    BOOLEAN = "boolean"
    LIST = "list"
    DICT = "dict"
    INT = "int"
    FLOAT = "float"
    STRING = "string"
    EXEC = "exec"
    BYTES = "bytes"
    IMAGE = "image"
    VECTOR2 = "vector2"
    ANY = "any"  # Solo para entradas especiales (p.ej. Expresión matemática)


class Vector2:
    def __init__(self, x: float, y: float) -> None:
        self.x = x
        self.y = y

Direction = Literal["in", "out"]


@dataclass(frozen=True)
class PortDef:
    name: str
    direction: Direction
    type: RouteType
    required: bool = False


@dataclass(frozen=True)
class ConfigField:
    key: str
    label: str
    type: Literal["string", "int", "float", "boolean", "select", "typed_value"]
    default: Any = None
    required: bool = False
    options: list[dict[str, Any]] = field(default_factory=list)
    # Solo se muestra si config[clave] está en la lista: {"var_type": ["list"]}
    visible_when: dict[str, list[Any]] = field(default_factory=dict)


@dataclass(frozen=True)
class NodeDef:
    type: str
    title: str
    inputs: list[PortDef]
    outputs: list[PortDef]
    config_fields: list[ConfigField] = field(default_factory=list)
    description: str = ""


@dataclass
class NodeInstance:
    id: str
    type: str
    x: float
    y: float
    config: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Edge:
    id: str
    from_node: str
    from_port: str
    to_node: str
    to_port: str
    type: RouteType


@dataclass
class ValidationError:
    node_id: str | None
    message: str


@dataclass
class ExecutionStep:
    node_id: str
    elapsed_ms: int
    completed_steps: int
    total_steps: int


@dataclass
class ExecutionResult:
    executed_order: list[str] = field(default_factory=list)
    console: list[str] = field(default_factory=list)
    notifications: list[str] = field(default_factory=list)
    steps: list[ExecutionStep] = field(default_factory=list)
    duration_ms: int = 0
    total_steps: int = 0


class ExecFire:
    def __init__(self) -> None:
        self.fired_ports: list[str] = []

    def fire(self, output_port_name: str) -> None:
        self.fired_ports.append(output_port_name)


class ResolveContext:
    def __init__(
        self,
        *,
        get_incoming_edge: Callable[[str, str], Edge | None],
        get_node: Callable[[str], NodeInstance],
        evaluate_output: Callable[[str, str], Any],
    ) -> None:
        self._get_incoming_edge = get_incoming_edge
        self._get_node = get_node
        self._evaluate_output = evaluate_output

    def input_value(
        self,
        node: NodeInstance,
        input_port: PortDef,
        *,
        default: Any = None,
    ) -> Any:
        edge = self._get_incoming_edge(node.id, input_port.name)
        if edge is not None:
            return self._evaluate_output(edge.from_node, edge.from_port)

        if input_port.name in node.config:
            return node.config.get(input_port.name)

        return default

    def output_value(self, node: NodeInstance, output_port: str) -> Any:
        return self._evaluate_output(node.id, output_port)


class BaseNode:
    definition: NodeDef

    @classmethod
    def evaluate_outputs(
        cls,
        node: NodeInstance,
        *,
        ctx: ResolveContext,
    ) -> dict[str, Any] | None:
        """Devuelve {puerto: valor} con todas las salidas de datos en una sola evaluación.

        Si devuelve None, el motor usa evaluate_output por cada puerto.
        """
        return None

    @classmethod
    def validate_instance(
        cls,
        node: NodeInstance,
        *,
        get_incoming_edge: Callable[[str, str], Edge | None],
        get_def: Callable[[str], NodeDef],
    ) -> list[ValidationError]:
        return []

    @classmethod
    def evaluate_output(
        cls,
        node: NodeInstance,
        output_port: str,
        *,
        ctx: ResolveContext,
    ) -> Any:
        raise NotImplementedError

    @classmethod
    def execute(
        cls,
        node: NodeInstance,
        *,
        triggered: bool,
        ctx: ResolveContext,
        fire: ExecFire,
        emit_console: Callable[[str], None],
        emit_notification: Callable[[str], None],
    ) -> None:
        raise NotImplementedError


def node_def_to_json(defn: NodeDef) -> dict[str, Any]:
    return {
        "type": defn.type,
        "title": defn.title,
        "description": defn.description,
        "inputs": [
            {
                "name": p.name,
                "direction": p.direction,
                "type": p.type.value,
                "required": p.required,
            }
            for p in defn.inputs
        ],
        "outputs": [
            {
                "name": p.name,
                "direction": p.direction,
                "type": p.type.value,
                "required": p.required,
            }
            for p in defn.outputs
        ],
        "configFields": [
            {
                "key": f.key,
                "label": f.label,
                "type": f.type,
                "default": f.default,
                "required": f.required,
                "options": f.options,
                "visibleWhen": f.visible_when,
            }
            for f in defn.config_fields
        ],
    }
