from __future__ import annotations

from time import sleep
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


class DelayNode(BaseNode):
    definition = NodeDef(
        type="delay",
        title="Delay (ms)",
        description="Nodo que representa un retardo en milisegundos.",
        inputs=[
            PortDef("exec_in", "in", RouteType.EXEC, required=True),
        ],
        outputs=[PortDef("exec_out", "out", RouteType.EXEC)],
        config_fields=[
            ConfigField(
                key="delay",
                label="Valor",
                type="int",
                default=1000,
                required=True
            )
        ],
    )

    @classmethod
    def validate_instance(cls, node: NodeInstance, *, get_incoming_edge, get_def) -> list[ValidationError]:
        delay = node.config.get("delay", 1000)
        if delay is None:
            return []
        try:
            value = int(delay)
        except (TypeError, ValueError):
            return [ValidationError(node_id=node.id, message="El valor de delay debe ser un entero")]
        if value < 0:
            return [ValidationError(node_id=node.id, message="El valor de delay no puede ser negativo")]
        return []

    @classmethod
    def evaluate_output(cls, node: NodeInstance, output_port: str, *, ctx: ResolveContext) -> Any:
        None
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
        delay_ms = node.config.get("delay", 1000)
        try:
            delay_ms = int(delay_ms)
        except (TypeError, ValueError):
            raise ValueError("El valor de delay debe ser un entero")
        if delay_ms < 0:
            raise ValueError("El valor de delay no puede ser negativo")
        delay = delay_ms / 1000.0
        sleep(delay)
        print(f"Delay de {delay_ms} ms completado")
        fire.fire("exec_out")