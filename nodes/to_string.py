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


class ToStringNode(BaseNode):
    definition = NodeDef(
        type="to_string",
        title="To String",
        description="Nodo que convierte un valor a cadena.",
        inputs=[
            PortDef("val_in", "in", RouteType.ANY, required=True),
        ],
        outputs=[PortDef("result", "out", RouteType.STRING)],
        config_fields=[
            
        ],
    )

    @classmethod
    def evaluate_output(cls, node: NodeInstance, output_port: str, *, ctx: ResolveContext) -> Any:
        if output_port != "result":
            raise ValueError("Salida desconocida")

        val_in = ctx.input_value(node, cls.definition.inputs[0], default=None)
        if val_in is None:
            raise ValueError("Falta valor para 'val_in'")

        return str(val_in)

   
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
