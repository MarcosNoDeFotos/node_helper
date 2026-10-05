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
)


class AlertNode(BaseNode):
    definition = NodeDef(
        type="alert",
        title="alert",
        description="Muestra una notificación arriba a la derecha.",
        inputs=[
            PortDef("exec_in", "in", RouteType.EXEC, required=True),
            PortDef("text", "in", RouteType.STRING, required=False),
        ],
        outputs=[
            PortDef("exec_out", "out", RouteType.EXEC),
        ],
        config_fields=[
            ConfigField(
                key="text",
                label="Texto personalizado (si no hay entrada)",
                type="string",
                default="Notificación",
            )
        ],
    )

    @classmethod
    def evaluate_output(
        cls, node: NodeInstance, output_port: str, *, ctx: ResolveContext
    ) -> Any:
        raise ValueError("alert no tiene salidas de datos")

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
        text_in = ctx.input_value(node, cls.definition.inputs[1], default=None)
        if text_in is None or text_in == "":
            text_in = node.config.get("text") or ""
        emit_notification(str(text_in))
        fire.fire("exec_out")
