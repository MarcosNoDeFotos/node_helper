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


class VariableNode(BaseNode):
    definition = NodeDef(
        type="variable",
        title="Variable",
        description="Nodo que representa una variable.",
        inputs=[
        ],
        outputs=[PortDef("result", "out", RouteType.ANY)],
        config_fields=[
            ConfigField(
                key="op",
                label="Valor",
                type="text",
                default="",
                required=True
            )
        ],
    )

    @classmethod
    def evaluate_output(cls, node: NodeInstance, output_port: str, *, ctx: ResolveContext) -> Any:
        if output_port != "result":
            raise ValueError("Salida desconocida")
        return node.config.get("op")

   
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
