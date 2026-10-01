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


class MathExpressionNode(BaseNode):
    definition = NodeDef(
        type="math_expr",
        title="Expresión matemática",
        description="Compara dos valores. Las entradas deben ser del mismo tipo cuando ambas estén conectadas.",
        inputs=[
            PortDef("a", "in", RouteType.ANY, required=True),
            PortDef("b", "in", RouteType.ANY, required=False),
        ],
        outputs=[PortDef("result", "out", RouteType.BOOLEAN)],
        config_fields=[
            ConfigField(
                key="op",
                label="Tipo de expresión",
                type="select",
                default="==",
                required=True,
                options=[
                    {"label": "==", "value": "=="},
                    {"label": "!=", "value": "!="},
                    {"label": "<=", "value": "<="},
                    {"label": ">=", "value": ">="},
                    {"label": "<", "value": "<"},
                    {"label": ">", "value": ">"},
                    {"label": "contains", "value": "contains"},
                    {"label": "is_none", "value": "is_none", "hide_inputs": ["b"]},
                    {"label": "is_not_none", "value": "is_not_none", "hide_inputs": ["b"]},
                ],
            )
        ],
    )

    @classmethod
    def validate_instance(cls, node: NodeInstance, *, get_incoming_edge, get_def) -> list[ValidationError]:
        a_edge = get_incoming_edge(node.id, "a")
        b_edge = get_incoming_edge(node.id, "b")
        if a_edge is not None and b_edge is not None and a_edge.type != b_edge.type:
            return [
                ValidationError(
                    node_id=node.id,
                    message=(
                        "Las entradas 'a' y 'b' deben ser del mismo tipo cuando ambas están conectadas."
                    ),
                )
            ]
        return []

    @classmethod
    def evaluate_output(cls, node: NodeInstance, output_port: str, *, ctx: ResolveContext) -> Any:
        if output_port != "result":
            raise ValueError("Salida desconocida")

        a = ctx.input_value(node, cls.definition.inputs[0], default=None)
        b = ctx.input_value(node, cls.definition.inputs[1], default=None)
        if a is None or (b is None and node.config.get("op") not in ["is_none", "is_not_none"]):
            raise ValueError("Faltan valores para 'a' y/o 'b'")

        op = node.config.get("op") or "=="

        if op == "==":
            return a == b
        if op == "!=":
            return a != b
        if op == "<=" or op == ">=" or op == "<" or op == ">":
            if not isinstance(a, (int, float, str)) or not isinstance(b, (int, float, str)):
                raise ValueError("El operador de comparación requiere int/float/string")
            if op == "<=":
                return a <= b
            if op == ">=":
                return a >= b
            if op == "<":
                return a < b
            return a > b

        if op == "contains":
            if isinstance(a, (list, str)):
                return b in a
            if isinstance(a, (int, float)):
                return str(b) in str(a)
            raise ValueError("'contains' solo soporta list/string/int/float")

        if op == "is_none":
            return a is None
        if op == "is_not_none":
            return a is not None

        raise ValueError("Operador no soportado")

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
